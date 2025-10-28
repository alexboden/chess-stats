import { getMonthlySummaries } from './frontend-game-utils.js';

const form = document.querySelector('#lookup-form');
const usernameInput = document.querySelector('#username');
const statusEl = document.querySelector('#status');
const resultsEl = document.querySelector('#results');

function setStatus(message, tone = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function pluralize(value, unit) {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function formatDuration(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return pluralize(totalMinutes, 'minute');
  }

  const hours = totalSeconds / 3600;
  const roundedHours = Math.round(hours * 10) / 10;
  const display = Number.isInteger(roundedHours) ? roundedHours.toString() : roundedHours.toFixed(1);
  return pluralize(Number(display), 'hour');
}

function escapeCsvValue(value) {
  if (value == null) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function exportCsv(summaries, totals, username) {
  if (!summaries.length) {
    return;
  }

  const header = ['Month', 'Time Played', 'Games', 'Record (W/L/D)'];
  const rows = summaries.map((summary) => {
    const wins = summary.wins ?? 0;
    const losses = summary.losses ?? 0;
    const draws = summary.draws ?? 0;
    const totalSeconds = summary.totalSeconds ?? 0;
    return [
      summary.archiveMonth,
      formatDuration(totalSeconds),
      summary.gameCount ?? 0,
      `${wins}/${losses}/${draws}`,
    ];
  });
  const totalRecord = `${totals.wins}/${totals.losses}/${totals.draws}`;
  const overallRow = [
    'Overall',
    formatDuration(totals.totalSeconds),
    totals.gameCount,
    totalRecord,
  ];
  const csvBody = [header, ...rows, overallRow]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');

  const csvContent = `\ufeff${csvBody}`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeUsername = (username || 'player').replace(/[^\w.-]/g, '_');
  link.download = `chess-stats-${safeUsername}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderSummaries(summaries, username) {
  if (!summaries.length) {
    resultsEl.innerHTML = '<p>No recent archives were found.</p>';
    return;
  }

  const sortedSummaries = [...summaries].sort((a, b) => b.archiveMonth.localeCompare(a.archiveMonth));
  const totals = sortedSummaries.reduce(
    (accum, summary) => {
      accum.totalSeconds += summary.totalSeconds ?? 0;
      accum.gameCount += summary.gameCount ?? 0;
      accum.wins += summary.wins ?? 0;
      accum.losses += summary.losses ?? 0;
      accum.draws += summary.draws ?? 0;
      return accum;
    },
    { totalSeconds: 0, gameCount: 0, wins: 0, losses: 0, draws: 0 },
  );
  const totalRecord = `${totals.wins}/${totals.losses}/${totals.draws}`;
  const rows = sortedSummaries
    .map(
      (summary) => {
        const wins = summary.wins ?? 0;
        const losses = summary.losses ?? 0;
        const draws = summary.draws ?? 0;
        const record = `${wins}/${losses}/${draws}`;
        return `
        <tr>
          <td>${summary.archiveMonth}</td>
          <td>${formatDuration(summary.totalSeconds)}</td>
          <td>${summary.gameCount}</td>
          <td>${record}</td>
        </tr>
        `;
      },
    )
    .join('');

  resultsEl.innerHTML = `
    <div class="totals" aria-label="Overall totals">
      <div class="totals__item">
        <span class="totals__label">Cumulative Time</span>
        <span class="totals__value">${formatDuration(totals.totalSeconds)}</span>
      </div>
      <div class="totals__item">
        <span class="totals__label">All Time Games</span>
        <span class="totals__value">${totals.gameCount}</span>
      </div>
      <div class="totals__item">
        <span class="totals__label">All Time Record (W/L/D)</span>
        <span class="totals__value">${totalRecord}</span>
      </div>
    </div>
    <div class="table-wrapper">
      <div class="table-toolbar">
        <h2 class="table-toolbar__heading">Monthly Chess Stats</h2>
        <button type="button" data-role="export-csv">Export CSV</button>
      </div>
      <table aria-label="Monthly chess stats">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Time Played</th>
            <th scope="col">Games</th>
            <th scope="col">Record (W/L/D)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  const exportButton = resultsEl.querySelector('[data-role="export-csv"]');
  if (exportButton) {
    exportButton.addEventListener('click', () => exportCsv(sortedSummaries, totals, username));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) {
    resultsEl.innerHTML = '';
    return;
  }

  setStatus('Fetching archives…');
  resultsEl.innerHTML = '';
  form.querySelector('button').disabled = true;

  try {
    const summaries = await getMonthlySummaries(username);
    if (!summaries.length) {
      setStatus(`No archives found for ${username}.`, 'warn');
      return;
    }
    const archiveCount = summaries.length;
    setStatus(`Loaded ${archiveCount} month${archiveCount === 1 ? '' : 's'} for ${username}.`, 'success');
    renderSummaries(summaries, username);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    setStatus(`Error fetching archives: ${message}`, 'error');
  } finally {
    form.querySelector('button').disabled = false;
  }
});
