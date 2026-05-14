// getMonthlySummaries is loaded from frontend-game-utils.js

const form = document.querySelector('#lookup-form');
const usernameInput = document.querySelector('#username');
const statusEl = document.querySelector('#status');
const resultsEl = document.querySelector('#results');

// Chart instances
let combinedChart = null;
let currentSummaries = null;

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

const TIME_CLASS_COLORS = {
  bullet: { border: '#e53935', bg: 'rgba(229, 57, 53, 0.08)' },
  blitz: { border: '#fb8c00', bg: 'rgba(251, 140, 0, 0.08)' },
  rapid: { border: '#00529b', bg: 'rgba(0, 82, 155, 0.08)' },
  daily: { border: '#43a047', bg: 'rgba(67, 160, 71, 0.08)' },
};

function getAvailableTimeClasses(summaries) {
  const classes = new Set();
  for (const s of summaries) {
    if (s.timeClasses) {
      for (const tc of Object.keys(s.timeClasses)) {
        if (tc !== 'unknown') classes.add(tc);
      }
    }
  }
  return [...classes].sort();
}

function getMostPlayedTimeClass(summaries) {
  const totals = {};
  for (const s of summaries) {
    if (s.timeClasses) {
      for (const [tc, data] of Object.entries(s.timeClasses)) {
        if (tc === 'unknown') continue;
        totals[tc] = (totals[tc] || 0) + data.gameCount;
      }
    }
  }
  let best = null;
  let bestCount = 0;
  for (const [tc, count] of Object.entries(totals)) {
    if (count > bestCount) {
      best = tc;
      bestCount = count;
    }
  }
  return best;
}

function renderCharts(summaries) {
  currentSummaries = summaries;

  // Populate format dropdown
  const formatSelect = document.getElementById('chartFormat');
  const availableClasses = getAvailableTimeClasses(summaries);
  const mostPlayed = getMostPlayedTimeClass(summaries);
  formatSelect.innerHTML = availableClasses.map(tc =>
    `<option value="${tc}"${tc === mostPlayed ? ' selected' : ''}>${tc.charAt(0).toUpperCase() + tc.slice(1)}</option>`
  ).join('');

  const chartMode = document.getElementById('chartMode')?.value || 'games';
  const format = formatSelect.value;
  renderCombinedChart(summaries, chartMode, format);
}

function renderCombinedChart(summaries, mode, format) {
  if (combinedChart) combinedChart.destroy();

  const ctx = document.getElementById('activityChart').getContext('2d');
  const recentSummaries = summaries.slice(0, 12).reverse();
  const labels = recentSummaries.map(s => s.archiveMonth);
  const colors = TIME_CLASS_COLORS[format] || { border: '#888', bg: 'rgba(136,136,136,0.08)' };

  let activityData, activityLabel;

  if (mode === 'games') {
    activityData = recentSummaries.map(s => s.timeClasses?.[format]?.gameCount || 0);
    activityLabel = 'Games Played';
  } else {
    activityData = recentSummaries.map(s => {
      const hours = (s.timeClasses?.[format]?.totalSeconds || 0) / 3600;
      return Math.round(hours * 10) / 10;
    });
    activityLabel = 'Hours Played';
  }

  const ratingData = recentSummaries.map(s => s.timeClasses?.[format]?.lastRating || null);
  const formatLabel = format.charAt(0).toUpperCase() + format.slice(1);

  combinedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: activityLabel,
          data: activityData,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Rating',
          data: ratingData,
          borderColor: '#333',
          backgroundColor: 'rgba(0,0,0,0.05)',
          borderDash: [5, 3],
          fill: false,
          tension: 0.4,
          spanGaps: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: true },
        title: { display: true, text: `${formatLabel} — ${activityLabel} vs Rating (Last 12 Months)`, color: '#000' }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: { color: '#eee' },
          ticks: { color: colors.border, font: { size: 13 } },
          title: { display: true, text: activityLabel, color: colors.border }
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: false,
          grid: { drawOnChartArea: false },
          ticks: { color: '#333', font: { size: 13 } },
          title: { display: true, text: 'Rating', color: '#333' }
        },
        x: { grid: { display: false }, ticks: { color: '#555' } }
      }
    }
  });
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
        <span class="totals__label">All Time Record</span>
        <span class="totals__value">${totalRecord}</span>
      </div>
    </div>

    <div class="charts-container">
      <div class="chart-card">
        <div class="chart-toolbar">
          <select id="chartMode">
            <option value="games">Games Played</option>
            <option value="time">Time Played</option>
          </select>
          <select id="chartFormat"></select>
        </div>
        <canvas id="activityChart"></canvas>
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

  // Initialize charts after DOM update
  renderCharts(sortedSummaries);

  const exportButton = resultsEl.querySelector('[data-role="export-csv"]');
  if (exportButton) {
    exportButton.addEventListener('click', () => exportCsv(sortedSummaries, totals, username));
  }

  const chartModeSelect = document.getElementById('chartMode');
  const chartFormatSelect = document.getElementById('chartFormat');
  if (chartModeSelect) {
    chartModeSelect.addEventListener('change', () => {
      renderCombinedChart(currentSummaries, chartModeSelect.value, chartFormatSelect.value);
    });
  }
  if (chartFormatSelect) {
    chartFormatSelect.addEventListener('change', () => {
      renderCombinedChart(currentSummaries, chartModeSelect.value, chartFormatSelect.value);
    });
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

const magnusPrompt = document.querySelector('#magnus-prompt');

function toggleMagnusPrompt() {
  if (magnusPrompt) {
    const hasText = usernameInput.value.trim().length > 0;
    magnusPrompt.style.display = hasText ? 'none' : 'block';
  }
}

// Initial check
toggleMagnusPrompt();

// Listen for input changes
usernameInput.addEventListener('input', toggleMagnusPrompt);

if (magnusPrompt) {
  magnusPrompt.addEventListener('click', () => {
    usernameInput.value = 'magnuscarlsen';
    usernameInput.focus();
    // Use requestSubmit to trigger the submit event and validation
    if (form.requestSubmit) {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });
}
