/**
 * 战斗系统（单例）
 *
 * 职责：
 *   - 管理场景内所有活跃的 SkillBox
 *   - 每帧 tick 所有盒子，处理超时自动销毁
 *   - 响应状态切换通知，销毁绑定状态的盒子
 *   - 提供 spawnBox 接口供 StateMachineComponent 在帧事件时调用
 *
 * 使用方法：
 *   在场景根节点下创建 "BattleSystem" 节点并挂载此组件
 */

import SkillBox, { SkillBoxShape } from "./SkillBox";
import { SkillBoxSpawnConfig } from "../SpriteAnimState";

const { ccclass } = cc._decorator;

@ccclass
export default class BattleSystem extends cc.Component {

    private static _instance: BattleSystem = null;

    static get instance(): BattleSystem {
        return BattleSystem._instance;
    }

    private _activeBoxes: SkillBox[] = [];

    onLoad() {
        if (BattleSystem._instance && BattleSystem._instance !== this) {
            cc.warn("[BattleSystem] 场景中存在多个 BattleSystem，只保留第一个");
            this.destroy();
            return;
        }
        BattleSystem._instance = this;
        cc.log("[BattleSystem] 初始化完成");
    }

    onDestroy() {
        if (BattleSystem._instance === this) {
            BattleSystem._instance = null;
        }
    }

    update(dt: number) {
        for (let i = this._activeBoxes.length - 1; i >= 0; i--) {
            const box = this._activeBoxes[i];
            if (!cc.isValid(box.node)) {
                this._activeBoxes.splice(i, 1);
                continue;
            }
            box.onTick(dt);
            if (box.isExpired()) {
                this._removeAt(i);
            }
        }
    }

    /**
     * 根据帧配置在场景中生成一个技能盒子
     *
     * 坐标说明：
     *   worldX = creatorNode.x + offsetX * facing（屏幕 X = 世界 X）
     *   worldY = offsetY（相对地面高度，地面 = 0）
     *   worldZ = offsetZ（深度偏移，正值 = 向远处）
     *
     * @param cfg         SpriteAnimState 上的帧生成配置
     * @param creatorNode 创建者节点（用于获取位置与朝向）
     * @param creatorId   创建者单位 ID
     */
    spawnBox(cfg: SkillBoxSpawnConfig, creatorNode: cc.Node, creatorId: number,
             creatorWorldY: number = 0, creatorWorldZ: number = 0): SkillBox {
        const node = new cc.Node("SkillBox");
        const box = node.addComponent(SkillBox);

        box.shapeType            = cfg.shapeType;
        box.sizeX                = cfg.sizeX;
        box.sizeY                = cfg.sizeY;
        box.sizeZ                = cfg.sizeZ;
        box.radius               = cfg.radius;
        box.creatorId            = creatorId;
        box.spawnTime            = Date.now();
        box.endTime              = cfg.duration >= 0 ? Date.now() + cfg.duration * 1000 : -1;
        box.destroyOnStateChange = cfg.destroyOnStateChange;

        // 水平偏移随朝向翻转（scaleX < 0 表示面朝左）
        const facing = creatorNode.scaleX >= 0 ? 1 : -1;
        box.worldX = creatorNode.x + cfg.offsetX * facing;
        box.worldY = creatorWorldY + cfg.offsetY;
        box.worldZ = creatorWorldZ + cfg.offsetZ;

        this.node.addChild(node);
        this._activeBoxes.push(box);

        cc.log(`[BattleSystem] 生成 SkillBox | shape=${SkillBoxShape[cfg.shapeType]} creator=${creatorId} frame=${cfg.frame} destroyOnChange=${cfg.destroyOnStateChange}`);
        return box;
    }

    /**
     * 创建者状态切换时调用
     * 销毁该创建者所有 destroyOnStateChange=true 的盒子
     */
    notifyStateChange(creatorId: number) {
        for (let i = this._activeBoxes.length - 1; i >= 0; i--) {
            const box = this._activeBoxes[i];
            if (box.creatorId === creatorId && box.destroyOnStateChange) {
                this._removeAt(i);
            }
        }
    }

    /** 获取当前所有活跃盒子（只读快照，供子系统碰撞检测使用） */
    getActiveBoxes(): ReadonlyArray<SkillBox> {
        return this._activeBoxes;
    }

    private _removeAt(i: number) {
        const box = this._activeBoxes[i];
        this._activeBoxes.splice(i, 1);
        if (cc.isValid(box.node)) {
            box.node.destroy();
        }
    }
}
