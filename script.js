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
    const todaysAllotment = { date: today, leave: false, allocations: {}, unavailable: {}, originalAllocations: {} };

    services.forEach(s => {
        const candidates = assignments[s] || [];
        if (candidates.length > 0) {
            // Sort by service count (ascending) to pick the one who did it least
            candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
            todaysAllotment.allocations[s] = candidates[0];
            todaysAllotment.originalAllocations[s] = candidates[0]; // Store original
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

function resetServiceAvailability(service) {
    const currentDay = history[history.length - 1];
    
    if (!currentDay || currentDay.leave) {
        alert("Please generate today's allotment first!");
        return;
    }
    
    // Clear the unavailable list for this service
    if (currentDay.unavailable && currentDay.unavailable[service]) {
        currentDay.unavailable[service] = [];
    }
    
    // Restore the original assignment for this service
    if (currentDay.originalAllocations && currentDay.originalAllocations[service]) {
        currentDay.allocations[service] = currentDay.originalAllocations[service];
    } else {
        // Fallback: if no original stored (for old data), recalculate
        const candidates = assignments[service] || [];
        if (candidates.length > 0) {
            candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
            currentDay.allocations[service] = candidates[0];
        }
    }
    
    saveAndRefresh();
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
            <div class="button-group">
                <button class="btn-danger" onclick="reassign('${service}')">Not Available</button>
                <button class="btn-reset" onclick="resetServiceAvailability('${service}')">Reset</button>
            </div>
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

    // Group services
    const serviceGroups = {
        roomCleaning: {
            title: 'Room Cleaning',
            services: ['Right Room', 'Left Room', 'Flat-2 Room']
        },
        prasadamOffering: {
            title: 'Prasadam Offering',
            services: ['Prasadam - Morning', 'Prasadam - Afternoon', 'Prasadam - Evening']
        },
        prasadamAreaCleaning: {
            title: 'Prasadam Area Cleaning',
            services: ['Area Clean - Morning', 'Area Clean - Afternoon', 'Area Clean - Evening']
        }
    };

    // Separate/standalone services
    const standaloneServices = ['Altar cleaning', 'Temple Hall Cleaning', 'Outside Area'];

    let tableRows = '';

    // Add standalone services first
    standaloneServices.forEach(service => {
        if (todayRecord.allocations[service]) {
            const devotee = todayRecord.allocations[service];
            tableRows += `
                <tr>
                    <td colspan="2">${service}</td>
                    <td><strong>${devotee}</strong></td>
                </tr>
            `;
        }
    });

    // Add grouped services with rowspan
    Object.entries(serviceGroups).forEach(([key, group]) => {
        const groupServices = group.services.filter(s => todayRecord.allocations[s]);
        if (groupServices.length > 0) {
            groupServices.forEach((service, idx) => {
                const devotee = todayRecord.allocations[service];
                if (idx === 0) {
                    // First row with vertical category cell
                    tableRows += `
                        <tr>
                            <td class="vertical-text" rowspan="${groupServices.length}">
                                <div class="vertical-content">${group.title}</div>
                            </td>
                            <td>${service.replace('Right Room', 'Right').replace('Left Room', 'Left').replace('Flat-2 Room', 'Flat-2').replace('Prasadam - ', '').replace('Area Clean - ', '')}</td>
                            <td><strong>${devotee}</strong></td>
                        </tr>
                    `;
                } else {
                    // Subsequent rows without category cell
                    tableRows += `
                        <tr>
                            <td>${service.replace('Right Room', 'Right').replace('Left Room', 'Left').replace('Flat-2 Room', 'Flat-2').replace('Prasadam - ', '').replace('Area Clean - ', '')}</td>
                            <td><strong>${devotee}</strong></td>
                        </tr>
                    `;
                }
            });
        }
    });

    const tableHTML = `
        <div class="date-header">${currentDate}</div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th colspan="2">Service</th>
                    <th>Assigned Devotee</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
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

// Download summary table as image
async function downloadSummaryAsImage() {
    const summaryContainer = document.getElementById('summaryTable');
    
    if (!summaryContainer || !summaryContainer.innerHTML.trim()) {
        alert('No summary table to download. Please generate an allotment first.');
        return;
    }

    try {
        // Create a wrapper with white background
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 540px;
            background: white;
            padding: 40px 30px;
            z-index: 10000;
        `;
        
        // Clone the summary container to preserve all styles
        const clonedContent = summaryContainer.cloneNode(true);
        wrapper.appendChild(clonedContent);
        document.body.appendChild(wrapper);

        // Wait a bit for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture with 9:16 aspect ratio (540x960)
        const canvas = await html2canvas(wrapper, {
            backgroundColor: '#ffffff',
            scale: 2.5,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // Remove wrapper
        document.body.removeChild(wrapper);

        // Crop or resize to exact 9:16 ratio if needed
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 540 * 2.5;
        finalCanvas.height = 890 * 2.5;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(canvas, 0, 0);

        // Convert to blob and download
        finalCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
            link.download = `Service-Summary-${date}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');

    } catch (error) {
        console.error('Error generating image:', error);
        alert('Failed to generate image. Please try again.');
    }
}

// Share to WhatsApp
async function shareToWhatsApp() {
    const summaryContainer = document.getElementById('summaryTable');
    
    if (!summaryContainer || !summaryContainer.innerHTML.trim()) {
        alert('No summary table to share. Please generate an allotment first.');
        return;
    }

    try {
        // Create a wrapper with white background
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 540px;
            background: white;
            padding: 40px 30px;
            z-index: 10000;
        `;
        
        // Clone the summary container to preserve all styles
        const clonedContent = summaryContainer.cloneNode(true);
        wrapper.appendChild(clonedContent);
        document.body.appendChild(wrapper);

        // Wait a bit for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture with 9:16 aspect ratio
        const canvas = await html2canvas(wrapper, {
            backgroundColor: '#ffffff',
            scale: 2.5,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // Remove wrapper
        document.body.removeChild(wrapper);

        // Create final canvas with exact 9:16 ratio
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 540 * 2.5;
        finalCanvas.height = 890 * 2.5;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(canvas, 0, 0);

        // Convert to blob
        finalCanvas.toBlob(async (blob) => {
            const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
            const file = new File([blob], `Service-Summary-${date}.png`, { type: 'image/png' });

            // Try Web Share API (works on mobile)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Service Summary',
                        text: `Daily Service Allotment - ${date}`
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('Error sharing:', err);
                        alert('Could not share. Please download and share manually.');
                    }
                }
            } else {
                // Fallback: Download the image and show instructions
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `Service-Summary-${date}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                
                alert('Image downloaded! Please open WhatsApp and share the downloaded image manually.\n\n(Direct WhatsApp sharing works on mobile devices)');
            }
        }, 'image/png');

    } catch (error) {
        console.error('Error generating image:', error);
        alert('Failed to generate image. Please try again.');
    }
}

// Run on load
init();