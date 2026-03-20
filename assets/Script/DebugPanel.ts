import SpriteAnimPlayer from "./SpriteAnimPlayer";
import UnitStateMachine from "./UnitStateMachine";

const { ccclass, property } = cc._decorator;

@ccclass
export default class DebugPanel extends cc.Component {

    @property(UnitStateMachine)
    stateMachine: UnitStateMachine = null;

    @property(SpriteAnimPlayer)
    animPlayer: SpriteAnimPlayer = null;

    private _label: cc.Label = null;

    onLoad() {
        const labelNode = new cc.Node("DebugLabel");
        labelNode.anchorX = 0;
        labelNode.anchorY = 1;

        this._label = labelNode.addComponent(cc.Label);
        this._label.fontSize = 24;
        this._label.lineHeight = 28;
        this._label.string = "";
        this._label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;

        // 放到 Canvas 左上角：Canvas 默认 960x640，左上角为 (-480, 320)
        const canvas = cc.director.getScene().getChildByName("Canvas");
        if (canvas) {
            canvas.addChild(labelNode);
            labelNode.setPosition(-480 + 8, 320 - 8);
        } else {
            this.node.addChild(labelNode);
        }
    }

    update() {
        if (!this._label) return;

        const state = this.stateMachine ? this.stateMachine.getCurrentState() : "N/A";
        const frame = this.animPlayer ? this.animPlayer.currentFrameIndex : 0;

        this._label.string = `State: ${state}\nFrame: ${frame}`;
    }
}
