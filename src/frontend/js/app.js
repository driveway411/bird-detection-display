import { renderDetectionCard } from './components/detectionCard.js';
import { generateQRCode } from './utils/qrCode.js';

const API_BASE_URL = '/api';
const REFRESH_INTERVAL = 60000; // 1 minute

async function fetchDetections(endpoint) {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('timestamp').textContent = now.toLocaleString();
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function updateDisplay() {
    try {
        // Update sections in parallel and compute global max for uniform sparkline scaling
        const [recentDetections, rareDetections] = await Promise.all([
            fetchDetections('detections/recent'),
            fetchDetections('detections/rare')
        ]);
        // Determine max frequency across all detections
        const allValues = [...recentDetections, ...rareDetections].flatMap(d => d.frequency);
        const globalMax = allValues.length ? Math.max(...allValues) : 1;

        // Update recent detections
        const recentGrid = document.querySelector('#recent-detections .detection-grid');
        if (recentGrid && Array.isArray(recentDetections)) {
            recentGrid.innerHTML = '';
            if (recentDetections.length === 0) {
                recentGrid.innerHTML = '<div class="no-detections">No recent detections</div>';
            } else {
                // First, process all detections to add the badgeType
                const processedDetections = recentDetections.map(detection => {
                    const freq = detection.frequency || [];
                    const last7Days = freq.slice(-7);
                    const olderDays = freq.slice(0, -7);
                    
                    const recentDetections = last7Days.reduce((sum, count) => sum + count, 0);
                    const olderDetections = olderDays.reduce((sum, count) => sum + count, 0);
                    
                    const showNewBadge = recentDetections > 0 && olderDetections === 0;
                    
                    return {
                        ...detection,
                        _showNewBadge: showNewBadge
                    };
                });
                
                // Sort detections: new badged first, then by original order
                const sortedDetections = [...processedDetections].sort((a, b) => {
                    // If one is new and the other isn't, sort the new one first
                    if (a._showNewBadge && !b._showNewBadge) return -1;
                    if (!a._showNewBadge && b._showNewBadge) return 1;
                    
                    // If both have the same badge status, maintain original order
                    return 0;
                });
                
                // Render the sorted detections
                sortedDetections.forEach(detection => {
                    const badgeType = detection._showNewBadge ? 'new' : null;
                    recentGrid.appendChild(renderDetectionCard(detection, globalMax, badgeType));
                });
            }
        }

        // Update rare detections
        const rareGrid = document.querySelector('#rare-detections .detection-grid');
        if (rareGrid && Array.isArray(rareDetections)) {
            rareGrid.innerHTML = '';
            if (rareDetections.length === 0) {
                rareGrid.innerHTML = '<div class="no-detections">No rare detections</div>';
            } else {
                rareDetections.forEach(detection => {
                    rareGrid.appendChild(renderDetectionCard(detection, globalMax, 'rare'));
                });
            }
        }

        // Generate detection counts table
        const tableContainer = document.getElementById('data-table-container');
        if (tableContainer && Array.isArray(recentDetections)) {
            const days = 31;
            const dateList = [];
            for (let i = days; i >= 1; i--) {
                const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
                dateList.push(d.toISOString().split('T')[0]);
            }
            // Do NOT reverse dateList or frequency. Both are oldest -> newest (left to right)
            let html = '<table class="debug-table"><thead><tr><th>Species</th>';
            dateList.forEach(date => { html += `<th>${date}</th>`; });
            html += '</tr></thead><tbody>';
            recentDetections.forEach(det => {
                html += `<tr><td>${det.common_name}</td>`;
                det.frequency.forEach(count => { html += `<td>${count}</td>`; });
                html += '</tr>';
            });
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        }

        // Update timestamp and QR code
        updateTimestamp();
        generateQRCode(window.location.href);

        // Update sanctuary name if available
        const sanctuaryElements = document.querySelectorAll('.sanctuary-name');
        sanctuaryElements.forEach(el => {
            el.textContent = 'Drumlin Farm'; // We'll make this configurable later
        });

    } catch (error) {
        console.error('Error updating display:', error);
        showError('Unable to fetch latest detections. Will retry soon...');
    }
}

// Initial update
updateDisplay();

// Refresh periodically
setInterval(updateDisplay, REFRESH_INTERVAL);

// Handle visibility changes (pause updates when tab is hidden)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(updateInterval);
    } else {
        updateDisplay();
        updateInterval = setInterval(updateDisplay, REFRESH_INTERVAL);
    }
});
