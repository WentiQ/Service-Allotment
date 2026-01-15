// Configuration & State
const services = [
    "Altar cleaning", "Temple Hall Cleaning", "Prasadam - Morning", 
    "Prasadam - Afternoon", "Prasadam - Evening", "Area Clean - Morning", 
    "Area Clean - Afternoon", "Area Clean - Evening", "Outside Area", 
    "Right Room", "Left Room", "Flat-2 Room"
];

let devotees = JSON.parse(localStorage.getItem('devotees')) || [];
let assignments = JSON.parse(localStorage.getItem('assignments')) || {}; // { service: [devoteeNames] }
let history = JSON.parse(localStorage.getItem('serviceHistory')) || []; // [{date, leave, allocations: {service: devotee}, unavailable: {service: [devoteeNames]}, confirmed: {service: devotee}, isConfirmed: boolean}]

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
    // Look at last 30 non-leave confirmed entries
    const activeHistory = history.filter(h => !h.leave && h.isConfirmed).slice(-30);
    let count = 0;
    activeHistory.forEach(day => {
        const services = day.confirmed || day.allocations;
        Object.values(services).forEach(d => {
            if (d === devoteeName) count++;
        });
    });
    return count;
}

function getServiceCountByService(devoteeName, service) {
    // Count how many times a devotee did a specific service in last 30 days
    const activeHistory = history.filter(h => !h.leave && h.isConfirmed).slice(-30);
    let count = 0;
    activeHistory.forEach(day => {
        const services = day.confirmed || day.allocations;
        if (services[service] === devoteeName) {
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

function getTodaysRecord() {
    const today = new Date().toLocaleDateString();
    return history.find(h => h.date === today);
}

function getTomorrowsRecord() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toLocaleDateString();
    return history.find(h => h.date === tomorrowDate);
}

function generateAllotment() {
    // Check if today's services are confirmed (if today's record exists)
    const todayRecord = getTodaysRecord();
    if (todayRecord && !todayRecord.leave && !todayRecord.isConfirmed) {
        alert("Please confirm today's services before generating tomorrow's schedule!");
        return;
    }

    // Generate for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toLocaleDateString();
    
    // Check if tomorrow's schedule already exists
    const existingTomorrow = getTomorrowsRecord();
    if (existingTomorrow) {
        alert("Tomorrow's schedule has already been generated!");
        return;
    }

    const tomorrowsAllotment = { 
        date: tomorrowDate, 
        leave: false, 
        allocations: {}, 
        unavailable: {}, 
        originalAllocations: {},
        confirmed: {},
        isConfirmed: false
    };

    services.forEach(s => {
        const candidates = assignments[s] || [];
        if (candidates.length > 0) {
            // Sort by service count (ascending) to pick the one who did it least
            candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
            tomorrowsAllotment.allocations[s] = candidates[0];
            tomorrowsAllotment.originalAllocations[s] = candidates[0]; // Store original
        }
    });

    history.push(tomorrowsAllotment);
    saveAndRefresh();
}

function reassign(service) {
    const tomorrowRecord = getTomorrowsRecord();
    if (!tomorrowRecord) {
        alert("Please generate tomorrow's allotment first!");
        return;
    }
    
    const currentDevotee = tomorrowRecord.allocations[service];
    
    // Initialize unavailable list for this service if it doesn't exist
    if (!tomorrowRecord.unavailable) tomorrowRecord.unavailable = {};
    if (!tomorrowRecord.unavailable[service]) tomorrowRecord.unavailable[service] = [];
    
    // Mark current devotee as unavailable for tomorrow
    if (!tomorrowRecord.unavailable[service].includes(currentDevotee)) {
        tomorrowRecord.unavailable[service].push(currentDevotee);
    }
    
    // Filter out all unavailable devotees for this service tomorrow
    const candidates = (assignments[service] || []).filter(d => 
        !tomorrowRecord.unavailable[service].includes(d)
    );

    if (candidates.length > 0) {
        candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
        tomorrowRecord.allocations[service] = candidates[0];
        saveAndRefresh();
    } else {
        alert("No other available devotees assigned to this category!");
    }
}

function resetServiceAvailability(service) {
    const tomorrowRecord = getTomorrowsRecord();
    
    if (!tomorrowRecord || tomorrowRecord.leave) {
        alert("Please generate tomorrow's allotment first!");
        return;
    }
    
    // Clear the unavailable list for this service
    if (tomorrowRecord.unavailable && tomorrowRecord.unavailable[service]) {
        tomorrowRecord.unavailable[service] = [];
    }
    
    // Restore the original assignment for this service
    if (tomorrowRecord.originalAllocations && tomorrowRecord.originalAllocations[service]) {
        tomorrowRecord.allocations[service] = tomorrowRecord.originalAllocations[service];
    } else {
        // Fallback: if no original stored (for old data), recalculate
        const candidates = assignments[service] || [];
        if (candidates.length > 0) {
            candidates.sort((a, b) => getServiceCount(a) - getServiceCount(b));
            tomorrowRecord.allocations[service] = candidates[0];
        }
    }
    
    saveAndRefresh();
}

function toggleLeave() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toLocaleDateString();
    
    let dayIdx = history.findIndex(h => h.date === tomorrowDate);
    if (dayIdx === -1) {
        history.push({ date: tomorrowDate, leave: true, allocations: {}, isConfirmed: false });
    } else {
        history[dayIdx].leave = !history[dayIdx].leave;
    }
    saveAndRefresh();
}

// UI Refreshers
function renderToday() {
    renderTodayConfirmation();
    renderTomorrowSchedule();
    renderServiceWiseCount();
    renderDevoteeWiseCount();
}

function renderTodayConfirmation() {
    const container = document.getElementById('todayConfirmation');
    const todayRecord = getTodaysRecord();
    
    if (!todayRecord) {
        container.innerHTML = "<p style='text-align:center; color:#999;'>No services scheduled for today.</p>";
        return;
    }
    
    if (todayRecord.leave) {
        container.innerHTML = "<h3>Today is a Leave Day. No services to confirm.</h3>";
        return;
    }
    
    if (todayRecord.isConfirmed) {
        container.innerHTML = `
            <div class="confirmed-message">
                <h3>✓ Today's services have been confirmed</h3>
                <button onclick="editConfirmation()">Edit Confirmation</button>
            </div>
        `;
        return;
    }
    
    // Show confirmation form
    container.innerHTML = `
        <h3>Confirm Today's Services (${new Date().toLocaleDateString()})</h3>
        <div class="confirmation-grid">
            ${services.map(service => {
                if (!todayRecord.allocations[service]) return '';
                const assignedDevotee = todayRecord.allocations[service];
                const confirmedDevotee = todayRecord.confirmed?.[service] || assignedDevotee;
                
                return `
                    <div class="confirmation-card">
                        <h4>${service}</h4>
                        <p><small>Assigned: ${assignedDevotee}</small></p>
                        <label>Who performed this service?</label>
                        <select id="confirm_${service.replace(/\s+/g, '_')}" onchange="updateConfirmation('${service}', this.value)">
                            <option value="${assignedDevotee}" ${confirmedDevotee === assignedDevotee ? 'selected' : ''}>${assignedDevotee} (Assigned)</option>
                            ${(assignments[service] || [])
                                .filter(d => d !== assignedDevotee)
                                .map(d => `<option value="${d}" ${confirmedDevotee === d ? 'selected' : ''}>${d}</option>`)
                                .join('')}
                            <option value="NONE" ${confirmedDevotee === 'NONE' ? 'selected' : ''}>No one (Service not done)</option>
                        </select>
                    </div>
                `;
            }).join('')}
        </div>
        <button class="btn-primary" onclick="confirmTodaysServices()" style="margin-top: 20px;">Confirm All Services</button>
    `;
}

function renderTomorrowSchedule() {
    const container = document.getElementById('allotmentDisplay');
    const summaryContainer = document.getElementById('summaryTable');
    const tomorrowRecord = getTomorrowsRecord();
    
    if (!tomorrowRecord) {
        container.innerHTML = "<h3>Click 'Generate Tomorrow's Allotment' to create schedule.</h3>";
        summaryContainer.innerHTML = "";
        return;
    }
    
    if (tomorrowRecord.leave) {
        container.innerHTML = "<h3>Tomorrow is a Leave Day. No services counted.</h3>";
        summaryContainer.innerHTML = "";
        return;
    }

    container.innerHTML = Object.entries(tomorrowRecord.allocations).map(([service, devotee]) => `
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
    renderSummaryTable(tomorrowRecord);
}

function updateConfirmation(service, devotee) {
    const todayRecord = getTodaysRecord();
    if (!todayRecord) return;
    
    if (!todayRecord.confirmed) todayRecord.confirmed = {};
    todayRecord.confirmed[service] = devotee;
    localStorage.setItem('serviceHistory', JSON.stringify(history));
}

function confirmTodaysServices() {
    const todayRecord = getTodaysRecord();
    if (!todayRecord) {
        alert("No services to confirm for today!");
        return;
    }
    
    // Initialize confirmed object if not exists
    if (!todayRecord.confirmed) {
        todayRecord.confirmed = {};
    }
    
    // For any service not explicitly confirmed, use the assigned devotee
    services.forEach(service => {
        if (todayRecord.allocations[service] && !todayRecord.confirmed[service]) {
            todayRecord.confirmed[service] = todayRecord.allocations[service];
        }
    });
    
    todayRecord.isConfirmed = true;
    saveAndRefresh();
    alert("Today's services have been confirmed!");
}

function editConfirmation() {
    const todayRecord = getTodaysRecord();
    if (!todayRecord) return;
    
    todayRecord.isConfirmed = false;
    saveAndRefresh();
}

function renderSummaryTable(todayRecord) {
    const container = document.getElementById('summaryTable');
    
    if (!todayRecord || todayRecord.leave || Object.keys(todayRecord.allocations).length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#999;'>No services assigned yet.</p>";
        return;
    }

    // Use the date from the record instead of current date
    const recordDate = new Date(todayRecord.date);
    const currentDate = recordDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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