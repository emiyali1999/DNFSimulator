/**
 * 技能盒子基类
 *
 * 代表一个由技能帧产生的判定区域，持有形状数据和生命周期信息。
 * 子类继承此类实现具体判定逻辑（单点伤害、范围伤害、持续判定等）。
 *
 * 生命周期由 BattleSystem 统一管理：
 *   - endTime >= 0 时，到达 endTime 毫秒时自动销毁
 *   - destroyOnStateChange = true 时，创建者状态切换时立即销毁
 *   - 调用 node.destroy() 可立即销毁（BattleSystem 会自动清理引用）
 *
 * 坐标系与 PlayerController 一致（3D 世界坐标）：
 *   worldX — 水平轴（与屏幕 X 1:1 对应）
 *   worldY — 高度轴（地面 = 0）
 *   worldZ — 深度轴（正方向为屏幕上方/远处）
 */

const { ccclass } = cc._decorator;

export enum SkillBoxShape {
    Box    = 0,   // 轴对齐长方体（AABB）
    Sphere = 1,   // 球体
}

@ccclass
export default class SkillBox extends cc.Component {

    // ── 形状 ─────────────────────────────────────────────────
    shapeType: SkillBoxShape = SkillBoxShape.Box;

    /** 长方体全长（X 轴，水平方向） */
    sizeX: number = 100;
    /** 长方体全高（Y 轴，高度方向） */
    sizeY: number = 100;
    /** 长方体全深（Z 轴，深度方向） */
    sizeZ: number = 100;

    /** 球体半径 */
    radius: number = 50;

    // ── 世界坐标（游戏 3D 坐标系） ────────────────────────────
    worldX: number = 0;
    worldY: number = 0;
    worldZ: number = 0;

    // ── 生命周期 ──────────────────────────────────────────────
    /** 创建时间（毫秒，Date.now()） */
    spawnTime: number = 0;

    /**
     * 到期时间（毫秒，Date.now()）
     * -1 = 无时间限制，完全依赖 destroyOnStateChange 或手动销毁
     */
    endTime: number = -1;

    /** 创建者单位 ID，对应 UnitSystem 中分配的 unitId */
    creatorId: number = -1;

    /**
     * 是否在创建者状态切换时销毁
     * true  — 跟随状态生命周期（普通攻击判定帧，状态结束即消失）
     * false — 独立存活直到 endTime（弹体、陷阱、持续 AOE 等）
     */
    destroyOnStateChange: boolean = true;

    // ── 公共接口 ──────────────────────────────────────────────

    /** 是否已到期（endTime = -1 时永不到期） */
    isExpired(): boolean {
        return this.endTime >= 0 && Date.now() >= this.endTime;
    }

    /**
     * 与另一个盒子的重叠检测（AABB / 球面）
     * 子类可重写以实现旋转盒、扇形等精确碰撞
     */
    overlaps(other: SkillBox): boolean {
        if (this.shapeType === SkillBoxShape.Sphere && other.shapeType === SkillBoxShape.Sphere) {
            const dx = this.worldX - other.worldX;
            const dy = this.worldY - other.worldY;
            const dz = this.worldZ - other.worldZ;
            const rSum = this.radius + other.radius;
            return dx * dx + dy * dy + dz * dz <= rSum * rSum;
        }

        // Box vs Box 或 Box vs Sphere：统一转为半尺寸后做 AABB 检测
        const ax = this.shapeType === SkillBoxShape.Box ? this.sizeX * 0.5 : this.radius;
        const ay = this.shapeType === SkillBoxShape.Box ? this.sizeY * 0.5 : this.radius;
        const az = this.shapeType === SkillBoxShape.Box ? this.sizeZ * 0.5 : this.radius;
        const bx = other.shapeType === SkillBoxShape.Box ? other.sizeX * 0.5 : other.radius;
        const by = other.shapeType === SkillBoxShape.Box ? other.sizeY * 0.5 : other.radius;
        const bz = other.shapeType === SkillBoxShape.Box ? other.sizeZ * 0.5 : other.radius;

        return Math.abs(this.worldX - other.worldX) <= ax + bx &&
               Math.abs(this.worldY - other.worldY) <= ay + by &&
               Math.abs(this.worldZ - other.worldZ) <= az + bz;
    }

    /**
     * 每帧 tick，由 BattleSystem 调用
     * 子类重写以实现追踪、持续伤害、位移等逻辑
     */
    onTick(_dt: number): void {}
}
