import { describe, expect, it } from 'vitest';
import { battleReducer, createBattleState } from './battle';

function base() {
  return createBattleState({
    characterId: 'luqingya',
    equipment: ['tangdao', 'lihuojing'],
    campaignId: 'camp_1',
    lunarMonthId: 'shen',
    solarTermId: 'dongzhi',
    seed: 999,
  });
}

describe('诊断', () => {
  it('敌方回合应当造成伤害', () => {
    let s = base();
    const hp0 = s.player.hp;
    s = battleReducer(s, { type: 'END_TURN' });
    console.log('END_TURN 后 phase =', s.phase);
    s = battleReducer(s, { type: 'ENEMY_ACT' });
    console.log('ENEMY_ACT 后 hp =', s.player.hp, '(初始', hp0, ')');
    console.log('日志尾部:', s.log.slice(-6));
    console.log('phase =', s.phase, 'turn =', s.turn);
    expect(s.phase).toBe('playerTurn');
    expect(s.player.hp).toBeLessThan(hp0);
  });
});
