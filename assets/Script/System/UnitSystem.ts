/**
 * 全局单位管理系统（单例）
 * 挂在场景中一个专属管理节点上，负责追踪场景内所有 Unit
 *
 * 使用方法：
 *   - 在场景根节点下创建 "UnitSystem" 节点并挂载此组件
 *   - 运行时通过 UnitSystem.instance 访问
 */

import Unit from "../Unit/Unit";

const { ccclass, property } = cc._decorator;

@ccclass
export default class UnitSystem extends cc.Component {

    private static _instance: UnitSystem = null;

    static get instance(): UnitSystem {
        return UnitSystem._instance;
    }

    private _units: { [id: number]: Unit } = {};
    private _nextId: number = 1;

    onLoad() {
        if (UnitSystem._instance && UnitSystem._instance !== this) {
            cc.warn("[UnitSystem] 场景中存在多个 UnitSystem，只保留第一个");
            this.destroy();
            return;
        }
        UnitSystem._instance = this;
        cc.log("[UnitSystem] 初始化完成");
    }

    onDestroy() {
        if (UnitSystem._instance === this) {
            UnitSystem._instance = null;
        }
    }

    /**
     * 注册单位，返回分配的 unitId
     * Unit.onLoad 中自动调用
     */
    registerUnit(unit: Unit): number {
        const id = this._nextId++;
        this._units[id] = unit;
        cc.log(`[UnitSystem] 注册单位 #${id}: ${unit.node.name}`);
        return id;
    }

    /**
     * 注销单位
     * Unit.onDestroy 中自动调用
     */
    unregisterUnit(id: number) {
        if (this._units[id]) {
            cc.log(`[UnitSystem] 注销单位 #${id}`);
            delete this._units[id];
        }
    }

    /** 根据 id 获取单位 */
    getUnit(id: number): Unit | null {
        return this._units[id] || null;
    }

    /** 获取所有已注册单位 */
    getAllUnits(): Unit[] {
        return Object.keys(this._units).map(id => this._units[Number(id)]);
    }

    /** 当前注册单位数量 */
    getUnitCount(): number {
        return Object.keys(this._units).length;
    }
}
