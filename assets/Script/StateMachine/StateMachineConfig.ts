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
     * 允许触发的最小帧索引（含），-1 表示不限
     * 例：minFrame=5 表示当前动画播到第 5 帧后才允许触发此转换
     */
    @property
    minFrame: number = -1;

    /**
     * 允许触发的最大帧索引（含），-1 表示不限
     * 与 minFrame 组合使用可定义"帧窗口"
     */
    @property
    maxFrame: number = -1;

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
