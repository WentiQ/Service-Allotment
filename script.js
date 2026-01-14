// Configuration & State
const services = [
    "Altar cleaning", "Temple Hall Cleaning", "Prasadam - Morning", 
    "Prasadam - Afternoon", "Prasadam - Evening", "Area Clean - Morning", 
    "Area Clean - Afternoon", "Area Clean - Evening", "Outside Area", 
    "Right Room", "Left Room", "Flat-2 Room"
];

let devotees = JSON.parse(localStorage.getItem('devotees')) || [];
let assignments = JSON.parse(localStorage.getItem('assignments')) || {}; // { service: [devoteeNames] }
let history = JSON.parse(localStorage.getItem('serviceHistory')) || []; // [{date, leave, allocations: {service: devotee}, unavailable: {service: [devoteeNames]}}]

// Initialize UI
function init() {
    renderDevotees();
    renderCategories();
    renderToday();
}

// 1. Devotee Management
function addDevotee() {
    const name = document.getElementById('devoteeName').value.trim();
    if (name && !devotees.includes(name)) {
        devotees.push(name);
        saveAndRefresh();
    }
}

function renderDevotees() {
    const container = document.getElementById('devoteeList');
    container.innerHTML = devotees.map(d => `
        <span class="tag">${d} <button onclick="removeDevotee('${d}')">x</button></span>
    `).join('');
}

// 2. Category Management
function renderCategories() {
    const container = document.getElementById('serviceCategories');
    container.innerHTML = services.map(s => `
        <div class="service-box">
            <strong>${s}</strong><br>
            <select onchange="assignToService('${s}', this.value)">
                <option value="">+ Add Devotee</option>
                ${devotees.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
            <div class="tag-container">
                ${(assignments[s] || []).map(d => `<span class="tag">${d} <button onclick="removeFromService('${s}','${d}')">x</button></span>`).join('')}
            </div>
        </div>
    `).join('');
}

function assignToService(service, name) {
    if (!name) return;
    if (!assignments[service]) assignments[service] = [];
    if (!assignments[service].includes(name)) {
        assignments[service].push(name);
        saveAndRefresh();
    }
}

// 3. Balancing Algorithm
function getServiceCount(devoteeName) {
    // Look at last 30 non-leave entries
    const activeHistory = history.filter(h => !h.leave).slice(-30);
    let count = 0;
    activeHistory.forEach(day => {
        Object.values(day.allocations).forEach(d => {
            if (d === devoteeName) count++;
        });
    });
    return count;
}

function getServiceCountByService(devoteeName, service) {
    // Count how many times a devotee did a specific service in last 30 days
    const activeHistory = history.filter(h => !h.leave).slice(-30);
    let count = 0;
    activeHistory.forEach(day => {
        if (day.allocations[service] === devoteeName) {
            count++;
        }
    });
    return count;
}

function getServiceWiseStats() {
    // Returns { serviceName: { devoteeName: count } }
    const stats = {};
    services.forEach(service => {
        stats[service] = {};
        const candidates = assignments[service] || [];
        candidates.forEach(devotee => {
            stats[service][devotee] = getServiceCountByService(devotee, service);
        });
    });
    return stats;
}

function getDevoteeWiseStats() {
    // Returns { devoteeName: totalCount }
    const stats = {};
    devotees.forEach(devotee => {
        stats[devotee] = getServiceCount(devotee);
    });
    return stats;
}

function generateAllotment() {
    const today = new Date().toLocaleDateString();
    const todaysAllotment = { date: today, leave: false, allocations: {}, unavailable: {} };

    services.forEach(s => {
        const candidates = assignments[s] || [];
        if (candidates.length > 0) {
            // Sort by service count (ascending) to pick the one who did it least
            candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
            todaysAllotment.allocations[s] = candidates[0];
        }
    });

    history.push(todaysAllotment);
    saveAndRefresh();
}

function reassign(service) {
    const currentDay = history[history.length - 1];
    const currentDevotee = currentDay.allocations[service];
    
    // Initialize unavailable list for this service if it doesn't exist
    if (!currentDay.unavailable) currentDay.unavailable = {};
    if (!currentDay.unavailable[service]) currentDay.unavailable[service] = [];
    
    // Mark current devotee as unavailable for today
    if (!currentDay.unavailable[service].includes(currentDevotee)) {
        currentDay.unavailable[service].push(currentDevotee);
    }
    
    // Filter out all unavailable devotees for this service today
    const candidates = (assignments[service] || []).filter(d => 
        !currentDay.unavailable[service].includes(d)
    );

    if (candidates.length > 0) {
        candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
        currentDay.allocations[service] = candidates[0];
        saveAndRefresh();
    } else {
        alert("No other available devotees assigned to this category!");
    }
}

function toggleLeave() {
    const today = new Date().toLocaleDateString();
    let dayIdx = history.findIndex(h => h.date === today);
    if (dayIdx === -1) {
        history.push({ date: today, leave: true, allocations: {} });
    } else {
        history[dayIdx].leave = !history[dayIdx].leave;
    }
    saveAndRefresh();
}

// UI Refreshers
function renderToday() {
    const container = document.getElementById('allotmentDisplay');
    const summaryContainer = document.getElementById('summaryTable');
    const todayRecord = history[history.length - 1];
    
    if (!todayRecord || todayRecord.leave) {
        container.innerHTML = todayRecord?.leave ? "<h3>Today is a Leave Day. No services counted.</h3>" : "<h3>Click generate to start today.</h3>";
        summaryContainer.innerHTML = "";
        return;
    }

    container.innerHTML = Object.entries(todayRecord.allocations).map(([service, devotee]) => `
        <div class="service-card">
            <h4>${service}</h4>
            <p>Assigned: <strong>${devotee}</strong></p>
            <p><small>30-day count: ${getServiceCount(devotee)}</small></p>
            <button class="btn-danger" onclick="reassign('${service}')">Not Available</button>
        </div>
    `).join('');

    // Render summary table
    renderSummaryTable(todayRecord);
    renderServiceWiseCount();
    renderDevoteeWiseCount();
}

function renderSummaryTable(todayRecord) {
    const container = document.getElementById('summaryTable');
    
    if (!todayRecord || todayRecord.leave || Object.keys(todayRecord.allocations).length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#999;'>No services assigned yet.</p>";
        return;
    }

    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const tableHTML = `
        <div class="date-header">${currentDate}</div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Service</th>
                    <th>Assigned Devotee</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(todayRecord.allocations).map(([service, devotee], index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${service}</td>
                        <td><strong>${devotee}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

function renderServiceWiseCount() {
    const container = document.getElementById('serviceWiseCount');
    const stats = getServiceWiseStats();
    
    const html = `
        <div class="stats-grid">
            ${services.map(service => {
                const devoteeStats = stats[service];
                const hasDevotees = Object.keys(devoteeStats).length > 0;
                
                return `
                    <div class="stat-card">
                        <h3 class="stat-service-name">${service}</h3>
                        ${hasDevotees ? `
                            <table class="mini-table">
                                <thead>
                                    <tr>
                                        <th>Devotee</th>
                                        <th>Count</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(devoteeStats)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([devotee, count]) => `
                                        <tr>
                                            <td>${devotee}</td>
                                            <td><span class="count-badge">${count}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p class="no-data">No devotees assigned</p>'}
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = html;
}

function renderDevoteeWiseCount() {
    const container = document.getElementById('devoteeWiseCount');
    const stats = getDevoteeWiseStats();
    
    if (devotees.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#999;'>No devotees added yet.</p>";
        return;
    }
    
    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    
    const html = `
        <table class="devotee-stats-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Devotee Name</th>
                    <th>Total Services (30 days)</th>
                </tr>
            </thead>
            <tbody>
                ${sortedStats.map(([devotee, count], index) => `
                    <tr>
                        <td><span class="rank-badge">${index + 1}</span></td>
                        <td><strong>${devotee}</strong></td>
                        <td><span class="total-count">${count}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

function saveAndRefresh() {
    localStorage.setItem('devotees', JSON.stringify(devotees));
    localStorage.setItem('assignments', JSON.stringify(assignments));
    localStorage.setItem('serviceHistory', JSON.stringify(history));
    init();
}

function removeFromService(s, d) {
    assignments[s] = assignments[s].filter(name => name !== d);
    saveAndRefresh();
}

function removeDevotee(name) {
    devotees = devotees.filter(d => d !== name);
    saveAndRefresh();
}

// Run on load
init();