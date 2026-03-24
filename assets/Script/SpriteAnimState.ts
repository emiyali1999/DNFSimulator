const { ccclass, property } = cc._decorator;

/**
 * 单帧偏移数据
 */
@ccclass("FrameOffset")
export class FrameOffset {
    @property(cc.Vec2)
    offset: cc.Vec2 = cc.Vec2.ZERO;
}

/**
 * 单个状态的动画数据
 *
 * 配置方式：
 *   1. 将序列帧图片（以数字命名，如 0.png、1.png …）放入 resources 下某个文件夹
 *   2. 设置 spriteFolderPath 为该文件夹的 resources 相对路径（不含扩展名）
 *      例如："Textures/Player/Idle"
 *   3. 填写 startIndex / endIndex 指定使用哪段连续帧
 *   4. offsets 数组长度须等于 endIndex - startIndex + 1，每项对应一帧的偏移
 *      （若某帧不需要偏移可保持 Vec2.ZERO，数组留空则所有帧偏移均为零）
 *   5. 保存为 Prefab，放入 StateMachineConfig.animStatesFolder 所指的文件夹
 */
@ccclass
export default class SpriteAnimState extends cc.Component {

    @property
    stateName: string = "";

    /**
     * 序列帧图片所在的 resources 相对路径（文件夹），图片以纯数字命名
     * 例如："Textures/Player/Idle"，则运行时加载 "Textures/Player/Idle/0"、"…/1" …
     */
    @property
    spriteFolderPath: string = "";

    /** 起始帧索引（含） */
    @property
    startIndex: number = 0;

    /** 终止帧索引（含） */
    @property
    endIndex: number = 0;

    /**
     * 每帧偏移，数组长度应等于 endIndex - startIndex + 1
     * 超出部分忽略，不足部分用 Vec2.ZERO 补齐
     */
    @property([FrameOffset])
    offsets: FrameOffset[] = [];

    @property
    fps: number = 10;

    @property
    loop: boolean = true;

    /**
     * 水平（左右）移动系数
     * 0 = 不可移动，1 = 正常速度，0.5 = 半速，以此类推
     */
    @property
    horizMoveScale: number = 0;

    /**
     * 垂直（上下/深度）移动系数
     * 0 = 不可移动，1 = 正常速度
     */
    @property
    vertMoveScale: number = 0;

    /**
     * 跳跃初速度（世界单位/秒），仅跳跃状态有效，0 表示非跳跃状态
     */
    @property
    jumpSpeed: number = 0;

    /**
     * 允许移动的帧索引列表（从 0 开始）
     * 空数组 = 所有帧均可移动（默认）
     * 例如 [0] = 只有第一帧可以移动
     */
    @property([Number])
    moveFrames: number[] = [];

    /**
     * 此状态期间锁定朝向，不允许通过按键翻转角色面朝方向
     */
    @property
    lockFacing: boolean = false;

    /**
     * 进入此状态时，是否根据当前按键对齐朝向
     * 默认 true；Attack02/03 等连招状态设为 false，保持攻击方向不变
     */
    @property
    alignFacingOnEnter: boolean = true;

    /**
     * 是否只允许往面朝方向移动（左右轴）
     * true（默认）：按与朝向相反的方向键时不产生水平位移
     * false：左右均可自由移动，如跳跃状态
     */
    @property
    onlyFacingDir: boolean = true;

    /**
     * 进入此状态时自动施加的水平速度（相对朝向，负值=向后）
     * 0 = 不自动水平移动（默认）
     * 例：-250 表示以 250 单位/秒的速度向角色背后飞出（后跳效果）
     * 此速度独立于方向键输入，持续到落地或被新状态覆盖
     */
    @property
    launchHorizSpeed: number = 0;

    // ── 运行时缓存 ────────────────────────────────────────────
    private _frames: cc.SpriteFrame[] = null;

    // ── 公共接口 ─────────────────────────────────────────────

    /** 帧数量（= endIndex - startIndex + 1） */
    get frameCount(): number {
        return Math.max(0, this.endIndex - this.startIndex + 1);
    }

    /** 是否已完成预加载 */
    isLoaded(): boolean {
        return this._frames !== null;
    }

    /** 获取第 localIndex 帧的 SpriteFrame（localIndex 从 0 开始） */
    getFrame(localIndex: number): cc.SpriteFrame {
        return this._frames ? (this._frames[localIndex] ?? null) : null;
    }

    /** 获取第 localIndex 帧的偏移（不足则返回 Vec2.ZERO） */
    getOffset(localIndex: number): cc.Vec2 {
        const f = this.offsets[localIndex];
        return f ? f.offset : cc.Vec2.ZERO;
    }

    /**
     * 预加载所有帧的 SpriteFrame
     * 由 StateMachineComponent 在初始化阶段调用，完成后回调 callback
     */
    preload(callback: (err?: Error) => void) {
        if (this._frames) {
            callback();
            return;
        }

        const count = this.frameCount;
        if (count <= 0 || !this.spriteFolderPath) {
            this._frames = [];
            callback();
            return;
        }

        const frames: cc.SpriteFrame[] = new Array(count).fill(null);
        let remaining = count;
        let anyError = false;

        for (let i = 0; i < count; i++) {
            const localI = i;
            const imgIndex = this.startIndex + i;
            const path = `${this.spriteFolderPath}/${imgIndex}`;

            cc.resources.load(path, cc.SpriteFrame, (err, sf: cc.SpriteFrame) => {
                if (err) {
                    cc.warn(`[SpriteAnimState "${this.stateName}"] 加载帧失败: ${path}`, err);
                    anyError = true;
                } else {
                    frames[localI] = sf;
                }

                remaining--;
                if (remaining === 0) {
                    this._frames = frames;
                    callback(anyError ? new Error(`"${this.stateName}" 部分帧加载失败`) : undefined);
                }
            });
        }
    }
}
