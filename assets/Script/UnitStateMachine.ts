import SpriteAnimState from "./SpriteAnimState";
import SpriteAnimPlayer from "./SpriteAnimPlayer";

const { ccclass, property } = cc._decorator;

@ccclass
export default class UnitStateMachine extends cc.Component {

    @property(SpriteAnimPlayer)
    animPlayer: SpriteAnimPlayer = null;

    @property({ tooltip: "resources 下的状态 Prefab 文件夹路径，如 AnimStates/Player" })
    statesFolder: string = "";

    @property
    defaultState: string = "idle";

    private _stateMap: Map<string, SpriteAnimState> = new Map();
    private _currentStateName: string = "";
    private _loaded: boolean = false;

    onLoad() {
        if (!this.statesFolder) {
            cc.warn("[UnitStateMachine] statesFolder 未配置");
            return;
        }
        this._loadStates();
    }

    private _loadStates() {
        cc.resources.loadDir(this.statesFolder, cc.Prefab, (err, prefabs: cc.Prefab[]) => {
            if (err) {
                cc.error(`[UnitStateMachine] 加载状态文件夹失败: ${this.statesFolder}`, err);
                return;
            }

            for (const prefab of prefabs) {
                const node = cc.instantiate(prefab);
                const state = node.getComponent(SpriteAnimState);
                if (state) {
                    this._stateMap.set(state.stateName, state);
                } else {
                    cc.warn(`[UnitStateMachine] Prefab "${prefab.name}" 上未找到 SpriteAnimState 组件，已跳过`);
                    node.destroy();
                }
            }

            this._loaded = true;
            cc.log(`[UnitStateMachine] 已加载 ${this._stateMap.size} 个状态: ${Array.from(this._stateMap.keys()).join(", ")}`);

            if (this.defaultState) {
                this.changeState(this.defaultState);
            }
        });
    }

    changeState(stateName: string) {
        if (stateName === this._currentStateName) return;

        const state = this._stateMap.get(stateName);
        if (!state) {
            cc.warn(`[UnitStateMachine] 状态未找到: ${stateName}`);
            return;
        }

        this._currentStateName = stateName;
        if (this.animPlayer) {
            this.animPlayer.play(state);
        }
    }

    getCurrentState(): string {
        return this._currentStateName;
    }

    isLoaded(): boolean {
        return this._loaded;
    }
}
