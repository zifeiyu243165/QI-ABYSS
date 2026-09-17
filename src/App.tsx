import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import './styles/global.css';
import type { SaveData } from './game/types';
import { SAVE_KEY, SAVE_VERSION } from './game/constants';
import { battleReducer, createBattleState } from './game/engine/battle';
import { CAMPAIGNS, CHARACTERS } from './game/data/actors';
import { IMPLEMENTED_TERMS, LUNAR_MONTHS, SOLAR_TERM_MAP } from './game/data/world';
import { DEFAULT_LOCALE, migrateSave } from './i18n';
import { BattleScreen } from './components/BattleScreen';
import { IntroSequence, LoadoutScreen, MainScreen, ResultScreen } from './components/Screens';
import { StanceSelectPanel } from './components/StanceSelectPanel';
import { DamageNumberLayer, FxLayer, ParryGlyph } from './components/fx/Effects';
import type { FxHandle } from './components/fx/Effects';
import { UI } from './components/battle/artAssets';

type Screen = 'main' | 'loadout' | 'select' | 'battle' | 'result';

const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  clearedCampaigns: [],
  selectedCharacterId: CHARACTERS[0]!.id,
  equipment: {
    [CHARACTERS[0]!.id]: ['tangdao', 'lihuojing'],
    [CHARACTERS[1]!.id]: ['miaodao', 'kanshuipei'],
    [CHARACTERS[2]!.id]: ['jian', 'wuleiling'],
  },
  fxLevel: 'lavish',
  locale: DEFAULT_LOCALE,
};

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return DEFAULT_SAVE;
    // 【S5】平滑迁移：版本升级不再清空玩家进度。
    // 旧实现「data.version !== SAVE_VERSION → 返回 DEFAULT_SAVE」会把通关记录与装备全部抹掉；
    // 现交给 migrateSave（纯函数，见 src/i18n/save-migration.ts）逐字段合并 + 补 locale。
    return migrateSave(JSON.parse(raw), DEFAULT_SAVE);
  } catch {
    return DEFAULT_SAVE;
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('main');
  const [save, setSave] = useState<SaveData>(loadSave);
  const [showIntro, setShowIntro] = useState(false);
  const [campaignId, setCampaignId] = useState<string>(CAMPAIGNS[0]!.id);
  const [env, setEnv] = useState({ lunarMonthId: LUNAR_MONTHS[6]!.id, solarTermId: IMPLEMENTED_TERMS[0]!.id });
  const fxRef = useRef<FxHandle | null>(null);

  const [battle, dispatch] = useReducer(battleReducer, undefined, () =>
    createBattleState({
      characterId: DEFAULT_SAVE.selectedCharacterId,
      equipment: DEFAULT_SAVE.equipment[DEFAULT_SAVE.selectedCharacterId] ?? [null, null],
      campaignId: CAMPAIGNS[0]!.id,
      lunarMonthId: LUNAR_MONTHS[6]!.id,
      solarTermId: IMPLEMENTED_TERMS[0]!.id,
      seed: 1,
    }),
  );

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [save]);

  /* ---------- 开始一局 ---------- */
  /**
   * 建局并进入战斗。
   *
   * 【T01 签名变更】`startBattle(cid, characterId)` —— 角色由调用方**显式传入**，
   * 内部一律用传入值 + `save.equipment[characterId]` 组建，**不再读闭包里的
   * `save.selectedCharacterId`**（择道面板刚 setSave 的这一刻闭包值仍是旧的，
   * 读它会把玩家选的角色丢掉）。
   */
  const startBattle = useCallback(
    (cid: string, characterId: string) => {
      const month = pick(LUNAR_MONTHS);
      const term = pick(IMPLEMENTED_TERMS);
      const seed = Math.floor(Math.random() * 1_000_000) + 1;

      setEnv({ lunarMonthId: month.id, solarTermId: term.id });
      setCampaignId(cid);
      dispatch({
        type: 'RESET',
        state: createBattleState({
          characterId,
          equipment: save.equipment[characterId] ?? [null, null],
          campaignId: cid,
          lunarMonthId: month.id,
          solarTermId: term.id,
          seed,
        }),
      });
      setShowIntro(true);
      setScreen('battle');
    },
    [save.equipment],
  );

  /* ---------- 胜负 ---------- */
  useEffect(() => {
    if ((battle.phase === 'won' || battle.phase === 'lost') && screen === 'battle') {
      const t = window.setTimeout(() => {
        if (battle.phase === 'won') {
          setSave((s) =>
            s.clearedCampaigns.includes(campaignId)
              ? s
              : { ...s, clearedCampaigns: [...s.clearedCampaigns, campaignId] },
          );
        }
        setScreen('result');
      }, 1200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [battle.phase, screen, campaignId]);

  const nextCampaign = useMemo(() => {
    const idx = CAMPAIGNS.findIndex((c) => c.id === campaignId);
    return CAMPAIGNS[idx + 1] ?? null;
  }, [campaignId]);

  const hasNext = nextCampaign !== null;

  /**
   * 待打战役：首个未通关的战役（与旧 `enterBattle` 内联逻辑等价）。
   * T01 之后「入局」先弹择道面板，故这里只算 id，由面板确认回调用它建局。
   */
  const pendingCampaign = useMemo(
    () => CAMPAIGNS.find((c) => !save.clearedCampaigns.includes(c.id)) ?? CAMPAIGNS[0]!,
    [save.clearedCampaigns],
  );

  const weather = screen === 'battle' ? (SOLAR_TERM_MAP[env.solarTermId]?.particle ?? 'none') : 'none';

  return (
    <div className="screen-frame">
      <FxLayer ref={fxRef} width={390} height={844} fxLevel={save.fxLevel} weather={weather} />
      <DamageNumberLayer numbers={battle.pendingNumbers} backdrop={UI.dmgBackdrop} />
      <ParryGlyph show={battle.pendingParryGlyph} />

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {screen === 'main' && (
          <MainScreen save={save} onStart={() => setScreen('select')} onLoadout={() => setScreen('loadout')} />
        )}

        {screen === 'loadout' && (
          <LoadoutScreen
            save={save}
            onBack={() => setScreen('main')}
            onChange={(patch) => setSave((s) => ({ ...s, ...patch }))}
          />
        )}

        {/* 择道面板（T01）：选人即选架势，确认后用**所选角色**开打 */}
        {screen === 'select' && (
          <StanceSelectPanel
            save={save}
            onBack={() => setScreen('main')}
            onConfirm={(cid) => {
              setSave((s) => ({ ...s, selectedCharacterId: cid }));
              startBattle(pendingCampaign.id, cid);
            }}
          />
        )}

        {screen === 'battle' && <BattleScreen state={battle} dispatch={dispatch} fxRef={fxRef} onExit={() => setScreen('main')} />}

        {screen === 'result' && (
          <ResultScreen
            state={battle}
            onNext={
              hasNext && nextCampaign
                ? () => startBattle(nextCampaign.id, save.selectedCharacterId)
                : undefined
            }
            onRetry={() => startBattle(campaignId, save.selectedCharacterId)}
            onHome={() => setScreen('main')}
          />
        )}
      </div>

      {showIntro && (
        <IntroSequence
          lunarMonthId={env.lunarMonthId}
          solarTermId={env.solarTermId}
          characterId={save.selectedCharacterId}
          onDone={() => setShowIntro(false)}
        />
      )}
    </div>
  );
}
