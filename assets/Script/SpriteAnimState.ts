const { ccclass, property } = cc._decorator;

/**
 * 单帧数据
 */
@ccclass("FrameData")
export class FrameData {
    @property(cc.SpriteFrame)
    spriteFrame: cc.SpriteFrame = null;

    @property(cc.Vec2)
    offset: cc.Vec2 = cc.Vec2.ZERO;
}

/**
 * 单个状态的动画数据
 * 使用方式：创建空节点 → 挂此组件 → 配置帧数据 → 保存为 Prefab
 * 将 Prefab 放入 resources 下的状态文件夹中供 UnitStateMachine 加载
 */
@ccclass
export default class SpriteAnimState extends cc.Component {
    @property
    stateName: string = "";

    @property([FrameData])
    frames: FrameData[] = [];

    @property
    fps: number = 10;

    @property
    loop: boolean = true;
}
