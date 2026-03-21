/**
 * 单位基类组件
 * 挂在角色根节点上，聚合 SpriteAnimPlayer 和 StateMachineComponent 引用，
 * 并自动向 UnitSystem 注册/注销自身
 *
 * 场景节点结构示例：
 *   PlayerNode  ← 挂 Unit + StateMachineComponent + PlayerController
 *     └── （SpriteAnimPlayer 也挂在 PlayerNode 或其子节点上）
 */

import SpriteAnimPlayer from "../SpriteAnimPlayer";
import StateMachineComponent from "../StateMachine/StateMachineComponent";
import UnitSystem from "../System/UnitSystem";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Unit extends cc.Component {

    /** 动画播放器 */
    @property(SpriteAnimPlayer)
    animPlayer: SpriteAnimPlayer = null;

    /** 状态机组件 */
    @property(StateMachineComponent)
    stateMachine: StateMachineComponent = null;

    private _unitId: number = -1;

    onLoad() {
        const system = UnitSystem.instance;
        if (system) {
            this._unitId = system.registerUnit(this);
        } else {
            cc.warn("[Unit] 未找到 UnitSystem，请确保场景中有 UnitSystem 节点");
        }
    }

    onDestroy() {
        const system = UnitSystem.instance;
        if (system && this._unitId >= 0) {
            system.unregisterUnit(this._unitId);
        }
    }

    /** 单位在 UnitSystem 中的唯一 ID */
    get unitId(): number {
        return this._unitId;
    }

    /** 获取当前状态名（快捷访问） */
    getCurrentState(): string {
        return this.stateMachine ? this.stateMachine.getCurrentState() : "";
    }
}
