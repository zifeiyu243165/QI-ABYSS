/**
 * 择道面板（T01 新增）—— 每次「入局」前先定「道」。
 *
 * 【语义】架势与角色**一对一绑定**（见 `data/actors.ts` 的 `Character.stance`）：
 *   tixiu 体修·连击蓄势 ← 陆青崖 / faxiu 法修·五行轮转 ← 苏绛雪 / sanxiu 散修·刀尖舔血 ← 谢无咎。
 * 因此「选架势」= 「选角色」，本面板直接展示三名角色即可（三张卡与 `STANCES` 一一对应）。
 *
 * 【结构】全屏 flex 列：顶部「返回 + 标题」→ 副标题 → 三张角色卡（可滚动）→ 底部「确认」。
 * - 基底复用 `Screens.tsx` 导出的 `AmbientBackground`（不复制第二份）；
 * - 卡片容器用 `GoldPanel`，按钮用 `JadeButton`；
 * - 选中态：描金粗边 + 轻微上浮；**单击即切换高亮**（一次生效，不做 toggle 取消）。
 *
 * 【文案铁律】本组件**零中文字面量**：所有界面文案走 `t('ui.select.*')`；
 * 昵称 / 日主 / 十神 / 架势名 / 玩法说明 / 装备名一律来自数据层（`data/**`），不在此硬编码。
 *
 * 【数据流】`onConfirm(characterId)` 由 `App.tsx` 承接：先落 `save.selectedCharacterId`，
 * 再用**传入的** characterId 建局（不读闭包里的旧值）。
 */
import { useState } from 'react';
import type { SaveData } from '../game/types';
import { CHARACTERS } from '../game/data/actors';
import { EQUIPMENT_MAP } from '../game/data/cards';
import { SHI_SHEN_MAP, STANCES } from '../game/data/world';
import { t } from '../i18n';
import { CharacterFigure } from './svg/Figure';
import { AmbientBackground } from './Screens';
import { GoldPanel, JadeButton } from './ui/Primitives';

interface StanceSelectPanelProps {
  /** 存档（读取每名角色的装备摘要 + 上次选择作为初始高亮） */
  save: SaveData;
  /** 返回主界面 */
  onBack: () => void;
  /** 确认：以所选角色入局 */
  onConfirm: (characterId: string) => void;
}

export function StanceSelectPanel({ save, onBack, onConfirm }: StanceSelectPanelProps) {
  /** 当前高亮角色 id（初始 = 存档上次选择，保证「入局」总有默认选中） */
  const [picked, setPicked] = useState<string>(save.selectedCharacterId);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AmbientBackground opacity={0.34} />

      {/* 顶部：返回 + 标题 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '12px 14px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <JadeButton variant="ghost" size="sm" onClick={onBack} style={{ width: 'auto', flex: '0 0 auto' }}>
          {t('ui.select.back')}
        </JadeButton>
        <span
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 22,
            letterSpacing: 4,
            color: 'var(--color-card-title)',
            textShadow: '0 1px 0 rgba(255,246,220,0.9), 0 3px 10px rgba(212,168,67,0.45)',
          }}
        >
          {t('ui.select.title')}
        </span>
      </div>

      {/* 副标题 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '0 16px 6px',
          fontSize: 10.5,
          color: 'var(--color-card-text-sub)',
          fontFamily: 'var(--font-brush)',
        }}
      >
        {t('ui.select.subtitle')}
      </div>

      {/* 三张角色卡 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '6px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {CHARACTERS.map((c) => {
          const stance = STANCES.find((s) => s.id === c.stance);
          const equip = save.equipment[c.id] ?? [null, null];
          const equipText = equip
            .map((id) => EQUIPMENT_MAP[id ?? '']?.name ?? t('ui.select.empty-equip'))
            .join(' / ');
          const active = picked === c.id;
          return (
            <div key={c.id} onClick={() => setPicked(c.id)} style={{ cursor: 'pointer' }}>
              <GoldPanel
                glow={active}
                style={{
                  padding: '10px 12px',
                  // 选中态：描金粗边 + 轻微上浮
                  border: active ? '3px solid var(--color-miaojin)' : '1.5px solid var(--color-miaojin)',
                  transform: active ? 'translateY(-3px)' : 'none',
                  transition: 'transform 140ms, border-color 140ms, box-shadow 140ms',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <CharacterFigure
                    characterId={c.id}
                    robe={c.palette.robe}
                    trim={c.palette.trim}
                    hair={c.palette.hair}
                    size={96}
                    flat
                  />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.7 }}>
                    {/* 姓名 + 日主印 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-brush)',
                          fontSize: 19,
                          color: 'var(--color-card-title)',
                        }}
                      >
                        {c.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-seal)',
                          fontSize: 10,
                          background: 'var(--color-zhuhong)',
                          color: 'var(--color-xuanzhi-warm)',
                          padding: '2px 5px',
                          borderRadius: 2,
                          transform: 'rotate(-4deg)',
                          fontWeight: 700,
                        }}
                      >
                        {c.rizhu}
                      </span>
                    </div>

                    {/* 十神 */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {c.shishen.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 10,
                            background: 'rgba(11,46,89,0.85)',
                            color: 'var(--color-yuebai)',
                            padding: '1px 6px',
                            borderRadius: 2,
                            border: '1px solid rgba(212,168,67,0.55)',
                          }}
                        >
                          {SHI_SHEN_MAP[s]?.name}
                        </span>
                      ))}
                    </div>

                    {/* 架势名 + 玩法说明（数据层文案，已有豁免） */}
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: 'var(--font-brush)',
                        fontSize: 12.5,
                        color: 'var(--color-card-title)',
                        fontWeight: 700,
                      }}
                    >
                      {t('ui.select.stance')} · {stance?.name}
                    </div>
                    <div style={{ color: 'var(--color-card-text-sub)', fontSize: 10.5, marginTop: 2 }}>
                      {stance?.desc}
                    </div>

                    {/* 装备摘要 */}
                    <div
                      style={{
                        marginTop: 4,
                        color: 'var(--color-card-text)',
                        fontSize: 10.5,
                        fontWeight: 600,
                      }}
                    >
                      {t('ui.select.equip')} · {equipText}
                    </div>
                  </div>
                </div>
              </GoldPanel>
            </div>
          );
        })}
      </div>

      {/* 底部确认 */}
      <div style={{ position: 'relative', zIndex: 1, padding: '6px 14px 14px' }}>
        <JadeButton variant="primary" size="lg" onClick={() => onConfirm(picked)}>
          {t('ui.select.confirm')}
        </JadeButton>
      </div>
    </div>
  );
}
