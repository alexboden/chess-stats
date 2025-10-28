const CHESS_COM_BASE_URL = 'https://api.chess.com/pub/player';
const SECONDS_PER_DAY = 24 * 60 * 60;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const error = new Error(`Request to ${url} failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchPlayerArchives(username) {
  const url = `${CHESS_COM_BASE_URL}/${encodeURIComponent(username)}/games/archives`;
  return fetchJson(url);
}

async function fetchGames(url) {
  return fetchJson(url);
}

function getTagValue(pgn, tagName) {
  const pattern = new RegExp(`^\\[${tagName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} "([^"]+)"\\]`, 'm');
  const match = pgn.match(pattern);
  return match ? match[1] : null;
}

function parseTimeString(timeString) {
  if (!timeString) {
    return null;
  }
  const parts = timeString.split(':');
  if (parts.length !== 3) {
    return null;
  }
  const [hours, minutes, seconds] = parts.map(Number);
  if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function secondsBetween(startSeconds, endSeconds) {
  if (startSeconds == null || endSeconds == null) {
    return 0;
  }
  let diff = ((endSeconds - startSeconds) + (SECONDS_PER_DAY)) % SECONDS_PER_DAY;
  if (diff < 0) {
	console.log('End time is before start time:', startSeconds, endSeconds);
	throw new Error('End time is before start time');
  }
  return diff;
}

function getPlayerPerspectiveResult(game, username) {
  if (!username || !game?.pgn) {
	// throw new Error('Username and game PGN are required to determine result');
    return null;
  }

  const playerUsername = username.toLowerCase();
  const { pgn } = game;
  const whiteTag = getTagValue(pgn, 'White');
  const blackTag = getTagValue(pgn, 'Black');
  const whiteUsername = whiteTag ? whiteTag.toLowerCase() : game?.white?.username?.toLowerCase() ?? null;
  const blackUsername = blackTag ? blackTag.toLowerCase() : game?.black?.username?.toLowerCase() ?? null;

  const isPlayerWhite = whiteUsername === playerUsername;
  const isPlayerBlack = blackUsername === playerUsername;
  if (!isPlayerWhite && !isPlayerBlack) {
	// throw new Error('Player username does not match either side of the game');
    return null;
  }

  const resultTag = getTagValue(pgn, 'Result');
  if (!resultTag) {
    return null;
  }

  if (resultTag === '1-0') {
    return isPlayerWhite ? 'win' : 'loss';
  }
  if (resultTag === '0-1') {
    return isPlayerBlack ? 'win' : 'loss';
  }
  if (resultTag === '1/2-1/2') {
    return 'draw';
  }
  return null;
}

async function summarizeArchive(archiveUrl, username) {
  const gamesData = await fetchGames(archiveUrl);
  const games = gamesData?.games ?? [];

  let totalSeconds = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const game of games) {
    if (!game?.pgn) {
      continue;
    }
    const { pgn } = game;
    const startTime = getTagValue(pgn, 'StartTime');
    const endTime = getTagValue(pgn, 'EndTime');
    const startSeconds = parseTimeString(startTime);
    const endSeconds = parseTimeString(endTime);
    totalSeconds += secondsBetween(startSeconds, endSeconds);
    const result = getPlayerPerspectiveResult(game, username);
    if (result === 'win') {
      wins += 1;
    } else if (result === 'draw') {
      draws += 1;
    } else if (result === 'loss') {
      losses += 1;
    }
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return {
    archiveUrl,
    archiveMonth: archiveUrl.slice(-7),
    totalSeconds,
    hours,
    minutes,
    hoursRounded: hours,
    gameCount: games.length,
    wins,
    losses,
    draws,
  };
}

export async function getMonthlySummaries(username) {
  const archives = await fetchPlayerArchives(username);
  const archiveUrls = archives?.archives;
  if (!Array.isArray(archiveUrls) || archiveUrls.length === 0) {
    return [];
  }

  const summaries = await Promise.all(archiveUrls.map((url) => summarizeArchive(url, username)));
  return summaries;
}

export async function getMostRecentGameSummary(username) {
  const summaries = await getMonthlySummaries(username);
  if (!summaries.length) {
    return null;
  }
  return summaries[summaries.length - 1];
}
