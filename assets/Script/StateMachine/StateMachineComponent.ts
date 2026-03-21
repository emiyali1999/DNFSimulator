/**
 * 状态机运行时组件
 * 挂在 Unit 节点上，负责：
 *   - 加载 StateMachineConfig 和所有动画状态
 *   - 监听键盘输入和动画结束事件
 *   - 根据 TransitionConfig 规则执行状态转换
 *   - 驱动 SpriteAnimPlayer 播放对应动画
 */

import StateMachineConfig, { ConditionType, TransitionConfig } from "./StateMachineConfig";
import SpriteAnimPlayer from "../SpriteAnimPlayer";
import SpriteAnimState from "../SpriteAnimState";
import { InputAction, initKeyMap, KEY_ACTION_MAP } from "./InputAction";

const { ccclass, property } = cc._decorator;

@ccclass
export default class StateMachineComponent extends cc.Component {

    /** 状态机配置 Prefab（包含 StateMachineConfig 组件） */
    @property(cc.Prefab)
    configPrefab: cc.Prefab = null;

    /** 动画播放器引用 */
    @property(SpriteAnimPlayer)
    animPlayer: SpriteAnimPlayer = null;

    // ── 内部状态 ─────────────────────────────────────────────
    private _config: StateMachineConfig = null;
    private _currentState: string = "";
    private _animStateMap: Map<string, SpriteAnimState> = new Map();
    private _loaded: boolean = false;

    /** 当前帧待处理的输入动作队列 */
    private _pendingInputs: string[] = [];

    // ── 生命周期 ─────────────────────────────────────────────
    onLoad() {
        initKeyMap();

        if (!this.configPrefab) {
            cc.warn("[StateMachineComponent] configPrefab 未配置");
            return;
        }

        const configNode = cc.instantiate(this.configPrefab);
        this._config = configNode.getComponent(StateMachineConfig);
        if (!this._config) {
            cc.error("[StateMachineComponent] configPrefab 上未找到 StateMachineConfig 组件");
            configNode.destroy();
            return;
        }

        // 注册键盘输入
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);

        // 监听动画结束事件
        if (this.animPlayer) {
            this.animPlayer.node.on("anim-finished", this._onAnimFinished, this);
        }

        this._loadAnimStates();
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        if (this.animPlayer) {
            this.animPlayer.node.off("anim-finished", this._onAnimFinished, this);
        }
        // 销毁临时实例化的 config 节点
        if (this._config) {
            this._config.node.destroy();
        }
    }

    update(_dt: number) {
        if (!this._loaded || this._pendingInputs.length === 0) return;

        for (const action of this._pendingInputs) {
            this._tryTransition(ConditionType.OnInput, action);
        }
        this._pendingInputs.length = 0;
    }

    // ── 私有方法 ─────────────────────────────────────────────
    private _loadAnimStates() {
        const folder = this._config.animStatesFolder;
        if (!folder) {
            cc.warn("[StateMachineComponent] animStatesFolder 未配置，跳过动画加载");
            this._finishLoad();
            return;
        }

        cc.resources.loadDir(folder, cc.Prefab, (err, prefabs: cc.Prefab[]) => {
            if (err) {
                cc.error("[StateMachineComponent] 加载动画状态失败:", err);
                this._finishLoad();
                return;
            }

            for (const prefab of prefabs) {
                const node = cc.instantiate(prefab);
                const state = node.getComponent(SpriteAnimState);
                if (state) {
                    this._animStateMap.set(state.stateName, state);
                } else {
                    cc.warn(`[StateMachineComponent] Prefab "${prefab.name}" 上未找到 SpriteAnimState，已跳过`);
                    node.destroy();
                }
            }

            cc.log(`[StateMachineComponent] 已加载 ${this._animStateMap.size} 个动画状态: [${Array.from(this._animStateMap.keys()).join(", ")}]`);
            this._finishLoad();
        });
    }

    private _finishLoad() {
        this._loaded = true;
        if (this._config.defaultState) {
            this._enterState(this._config.defaultState);
        }
        // 检查是否有 Immediate 转换
        this._tryTransition(ConditionType.Immediate, null);
    }

    private _onKeyDown(event: cc.Event.EventKeyboard) {
        const action = KEY_ACTION_MAP[event.keyCode];
        if (action) {
            this._pendingInputs.push(action);
        }
    }

    private _onAnimFinished(_stateName: string) {
        this._tryTransition(ConditionType.OnAnimFinish, null);
    }

    /**
     * 查找并执行满足条件的最高优先级转换
     * @param conditionType 触发条件类型
     * @param inputAction   当 conditionType = OnInput 时，对应的输入动作名
     */
    private _tryTransition(conditionType: ConditionType, inputAction: string | null) {
        if (!this._config) return;

        let best: TransitionConfig = null;

        for (const t of this._config.transitions) {
            // 检查源状态匹配
            if (t.fromState !== "*" && t.fromState !== this._currentState) continue;
            // 检查条件类型匹配
            if (t.conditionType !== conditionType) continue;
            // 检查输入动作匹配
            if (conditionType === ConditionType.OnInput && t.inputAction !== inputAction) continue;
            // 检查打断权限（非 canInterrupt 时需等动画结束，但 OnAnimFinish 本身已是动画结束）
            if (!t.canInterrupt && conditionType !== ConditionType.OnAnimFinish) {
                const animState = this._animStateMap.get(this._currentState);
                if (animState && !animState.loop && this.animPlayer) {
                    // 动画还在播放中，不允许打断
                    // 利用 animPlayer 的 _playing 状态（通过检查帧索引是否是最后一帧）
                    // 此处保守处理：如动画未结束则跳过
                    continue;
                }
            }

            if (!best || t.priority > best.priority) {
                best = t;
            }
        }

        if (best) {
            this._enterState(best.toState);
        }
    }

    private _enterState(stateName: string) {
        if (stateName === this._currentState) return;

        const prevState = this._currentState;
        this._currentState = stateName;

        // 播放对应动画
        const animState = this._animStateMap.get(stateName);
        if (animState && this.animPlayer) {
            this.animPlayer.play(animState);
        } else if (!animState) {
            cc.warn(`[StateMachineComponent] 动画状态未找到: "${stateName}"，请检查 animStatesFolder 或 stateName 配置`);
        }

        // 发出状态变化事件，供 Visualizer 等监听
        this.node.emit("state-changed", { from: prevState, to: stateName });
        cc.log(`[StateMachineComponent] ${prevState || "(init)"} → ${stateName}`);

        // 检查进入新状态后是否有 Immediate 转换
        this._tryTransition(ConditionType.Immediate, null);
    }

    // ── 公共接口 ─────────────────────────────────────────────

    /** 获取当前状态名 */
    getCurrentState(): string {
        return this._currentState;
    }

    /** 获取运行时配置对象 */
    getConfig(): StateMachineConfig {
        return this._config;
    }

    /** 是否已加载完毕（配置 + 动画均已就绪） */
    isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * 手动触发输入动作（供 AI 或其他外部系统调用）
     * @param action InputAction 枚举值或其字符串名称
     */
    triggerInput(action: InputAction | string) {
        if (this._loaded) {
            this._pendingInputs.push(action as string);
        }
    }

    /**
     * 直接强制切换到指定状态（绕过转换规则，用于特殊逻辑）
     */
    forceChangeState(stateName: string) {
        this._enterState(stateName);
    }
}
