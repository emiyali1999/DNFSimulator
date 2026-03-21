/**
 * 状态机配置数据容器
 *
 * 使用方法：
 *   1. 在场景中创建空节点，挂载 StateMachineConfig 组件
 *   2. 在 Inspector 里配置 states 和 transitions
 *      - states: 每个状态填写 stateName，以及 graphX/Y（决定可视化图中的布局位置）
 *      - transitions: 配置从哪个状态 + 什么条件 → 到哪个状态
 *   3. 将节点保存为 Prefab，放入 resources 目录
 *   4. 在 StateMachineComponent.configPrefab 中引用该 Prefab
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

/** 单个状态节点配置 */
@ccclass("StateNodeConfig")
export class StateNodeConfig {
    /** 状态唯一名称，对应 SpriteAnimState.stateName */
    @property
    stateName: string = "";

    /** 在可视化状态图中的 X 坐标（编辑器里调整布局用） */
    @property
    graphX: number = 0;

    /** 在可视化状态图中的 Y 坐标（编辑器里调整布局用） */
    @property
    graphY: number = 0;
}

/** 单条状态转换规则 */
@ccclass("TransitionConfig")
export class TransitionConfig {
    /** 源状态名，填 "*" 表示任意状态均可触发 */
    @property
    fromState: string = "";

    /** 目标状态名 */
    @property
    toState: string = "";

    /** 触发条件类型 */
    @property({ type: cc.Enum(ConditionType) })
    conditionType: ConditionType = ConditionType.OnInput;

    /**
     * 当 conditionType = OnInput 时，填写对应的 InputAction 名称
     * 例如："Attack1"、"Jump"、"MoveLeft"
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

    /** 所有状态节点配置（决定可视化图布局） */
    @property({ type: [StateNodeConfig] })
    states: StateNodeConfig[] = [];

    /** 所有状态转换规则 */
    @property({ type: [TransitionConfig] })
    transitions: TransitionConfig[] = [];
}
