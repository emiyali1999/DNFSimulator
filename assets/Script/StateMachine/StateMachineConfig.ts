/**
 * 状态机配置数据容器
 *
 * 使用方法：
 *   1. 在场景中创建空节点，挂载 StateMachineConfig 组件
 *   2. 在 states 数组中添加每个状态：填写 stateName，
 *      然后在该状态的 transitions 子数组里配置可以转到哪几个状态
 *   3. 若某条转换需要从"任意状态"触发，在 globalTransitions 里配置
 *   4. 将节点保存为 Prefab，放入 resources 目录
 *   5. 在 StateMachineComponent.configPrefab 中引用该 Prefab
 */

const { ccclass, property } = cc._decorator;

/** 转换触发条件类型 */
export enum ConditionType {
    /** 按下某个输入动作时触发 */
    OnInput = 0,
    /** 当前动画非循环播放完毕时触发 */
    OnAnimFinish = 1,
    /** 进入 fromState 后立即触发（常用于过渡状态） */
    Immediate = 2,
    /** 松开某个输入动作时触发 */
    OnInputRelease = 3,
    /** 在时间窗口内连按两次同一动作时触发 */
    OnDoubleTap = 4,
    /**
     * 持续按住某键时触发（自动连招）
     * 每帧检查 inputAction 是否仍在按住状态，配合 minFrame/maxFrame 控制触发窗口
     * 典型用法：Attack01→Attack02 配置 OnInputHeld X + minFrame=5，
     * 按住 X 时动画播到第5帧自动衔接下一段攻击
     */
    OnInputHeld = 6,
    /**
     * 组合键触发（手搓招式）
     * 按下 inputAction 键的同时，comboModifiers 中所有键均处于按住状态时触发
     * 优先级高于同帧的 OnInput，触发后消费对应的 OnInput 事件
     * 示例：inputAction="C", comboModifiers="Down" → 按住下键时按C触发
     */
    OnCombo = 5,
}

/** 参数比较运算符 */
export enum CompareOp {
    Equal          = 0,   // ==
    NotEqual       = 1,   // !=
    Greater        = 2,   // >
    GreaterOrEqual = 3,   // >=
    Less           = 4,   // <
    LessOrEqual    = 5,   // <=
}

/**
 * 单条参数条件
 * 所有条件均满足时，转换才允许触发
 * 例：paramName="stunned", compareOp=Equal, value=0 → 角色未眩晕时才可切换
 */
@ccclass("ParameterCondition")
export class ParameterCondition {
    /** 参数名，对应 StateMachineComponent.setParameter() 设置的 key */
    @property
    paramName: string = "";

    @property({ type: cc.Enum(CompareOp) })
    compareOp: CompareOp = CompareOp.Equal;

    @property
    value: number = 0;
}

/**
 * 单条出向转换规则（挂在具体状态下，无需再填 fromState）
 */
@ccclass("OutgoingTransition")
export class OutgoingTransition {
    /** 目标状态名 */
    @property
    toState: string = "";

    /** 触发条件类型 */
    @property({ type: cc.Enum(ConditionType) })
    conditionType: ConditionType = ConditionType.OnInput;

    /**
     * 当 conditionType = OnInput 时，填写对应的按键名
     * 例如："X"、"Z"、"Space"
     */
    @property
    inputAction: string = "";

    /**
     * 优先级（越大越优先）
     * 同一帧多个转换条件同时满足时，选取优先级最高的
     */
    @property
    priority: number = 0;

    /**
     * 是否可打断当前动画
     * false：必须等当前动画播放完才能响应此转换
     * true：任何时候都可触发
     */
    @property
    canInterrupt: boolean = true;

    /**
     * 是否为插入技能（优先级高于 canInterrupt 和帧窗口限制）
     * true：可在任意帧直接打断当前动画并跳转，忽略 minFrame/maxFrame 约束
     * false：遵守正常的 canInterrupt + 帧窗口规则
     *
     * 用途示例：S 技能可随时插入当前普攻动画，而 X 普攻只能在指定帧窗口内续接
     */
    @property
    canInsert: boolean = false;

    /**
     * 允许触发的最小帧索引（含），-1 表示不限
     * 例：minFrame=5 表示当前动画播到第 5 帧后才允许触发此转换
     * canInsert=true 时忽略此项
     */
    @property
    minFrame: number = -1;

    /**
     * 允许触发的最大帧索引（含），-1 表示不限
     * 与 minFrame 组合使用可定义"帧窗口"
     * canInsert=true 时忽略此项
     */
    @property
    maxFrame: number = -1;

    /**
     * 组合键修饰键，ConditionType.OnCombo 时生效
     * 语法：逗号(,) = AND，竖线(|) = OR
     *   "Down"       → 按住下箭头
     *   "Down|S"     → 按住下箭头 或 S 键（同一组键位的双键支持）
     *   "Down|S,A"   → (Down 或 S) 且 A 都要按住
     * 键名与 InputAction.ts 中的动作名一致（Left/Right/Up/Down/W/S/X/Z/C/…）
     */
    @property
    comboModifiers: string = "";

    /**
     * 预输入缓冲帧数（动画帧，0 = 关闭预输入）
     * 对 conditionType = OnInput 和 OnCombo 的转换均生效。
     * 按下对应技能键后，若 minFrame 尚未到达，系统会保留该输入最多 preInputFrames 个动画帧；
     * 期间一旦 minFrame 开放则自动触发此转换。
     * 按下其他技能键会立即清除预输入缓冲。
     *
     * 示例：preInputFrames=3，玩家在 minFrame 前 3 帧内按键，均视为有效输入
     */
    @property
    preInputFrames: number = 0;

    /**
     * 参数条件列表，所有条件同时满足时转换才生效
     * 留空则不做参数检查
     */
    @property([ParameterCondition])
    conditions: ParameterCondition[] = [];
}

/**
 * 单个状态节点配置
 * 展开后可在 transitions 子数组里直接填写"从该状态能转到哪里"
 */
@ccclass("StateNodeConfig")
export class StateNodeConfig {
    /** 状态唯一名称，对应 SpriteAnimState.stateName */
    @property
    stateName: string = "";

    /** 从该状态出发的所有转换规则 */
    @property([OutgoingTransition])
    transitions: OutgoingTransition[] = [];
}

/** 状态机配置组件，保存为 Prefab 供 StateMachineComponent 引用 */
@ccclass
export default class StateMachineConfig extends cc.Component {
    /** 默认（初始）状态名 */
    @property
    defaultState: string = "";

    /** 动画状态 Prefab 所在的 resources 文件夹路径，如 "AnimState/Character/SwordMan" */
    @property
    animStatesFolder: string = "";

    /**
     * 所有状态节点配置
     * 展开每一项可设置该状态能转换到哪些状态
     */
    @property([StateNodeConfig])
    states: StateNodeConfig[] = [];

    /**
     * 全局转换（相当于 fromState = "*"）
     * 无论当前处于哪个状态，只要满足条件就会触发
     */
    @property([OutgoingTransition])
    globalTransitions: OutgoingTransition[] = [];
}
