export const GAME_BOT_ID = 'bot:vordik';
export const GAME_BOT_NAME = 'Бот Вордик';
export const GAME_BOT_AVATAR = 'avatar-14-owl';

export function isBotGame(row) {
  return row?.player_two_id === GAME_BOT_ID;
}
