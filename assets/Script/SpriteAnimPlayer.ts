import SpriteAnimState from "./SpriteAnimState";

const { ccclass, property } = cc._decorator;

@ccclass
export default class SpriteAnimPlayer extends cc.Component {

    @property(cc.Vec2)
    globalOffset: cc.Vec2 = cc.Vec2.ZERO;

    private _spriteNode: cc.Node = null;
    private _sprite: cc.Sprite = null;
    private _currentState: SpriteAnimState = null;
    private _frameIndex: number = 0;
    private _elapsed: number = 0;
    private _playing: boolean = false;
    /** 临时覆盖 fps，-1 表示使用 state.fps，由外部（如跳跃同步）设置 */
    private _fpsOverride: number = -1;

    onLoad() {
        this._spriteNode = new cc.Node("SpriteDisplay");
        this._spriteNode.anchorX = 0;
        this._spriteNode.anchorY = 1;
        this._sprite = this._spriteNode.addComponent(cc.Sprite);
        this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        this._sprite.trim = false;
        this.node.addChild(this._spriteNode);
    }

    play(state: SpriteAnimState) {
        if (!state || state.frameCount === 0) return;

        this._currentState = state;
        this._frameIndex = 0;
        this._elapsed = 0;
        this._playing = true;
        this._fpsOverride = -1;     // 每次 play 重置 override

        this._applyFrame(0);
    }

    /**
     * 临时覆盖当前动画的播放帧率，使动画总时长 = frameCount / fps
     * 传入 -1 恢复使用 state.fps
     */
    setFpsOverride(fps: number) {
        this._fpsOverride = fps;
    }

    get currentFrameIndex(): number { return this._frameIndex; }

    update(dt: number) {
        if (!this._playing || !this._currentState) return;

        const state = this._currentState;
        const fps = this._fpsOverride > 0 ? this._fpsOverride : state.fps;
        const interval = 1 / fps;

        this._elapsed += dt;
        if (this._elapsed < interval) return;

        this._elapsed -= interval;
        this._frameIndex++;

        if (this._frameIndex >= state.frameCount) {
            if (state.loop) {
                this._frameIndex = 0;
            } else {
                this._frameIndex = state.frameCount - 1;
                this._playing = false;
                this.node.emit("anim-finished", state.stateName);
                return;
            }
        }

        this._applyFrame(this._frameIndex);
    }

    private _applyFrame(index: number) {
        if (!this._currentState || !this._sprite) return;

        const sf = this._currentState.getFrame(index);
        if (!sf) return;

        this._sprite.spriteFrame = sf;
        const size = sf.getOriginalSize();
        this._spriteNode.setContentSize(size);
        const offset = this._currentState.getOffset(index);
        this._spriteNode.setPosition(
            offset.x + this.globalOffset.x,
            -offset.y - this.globalOffset.y
        );
    }
}
