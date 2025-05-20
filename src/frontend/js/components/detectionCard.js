function createHistogram(data, maxValue) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '80'); 
    svg.setAttribute('viewBox', '0 0 100 80');
    svg.style.display = 'block';

    // Create a group for the bars
    const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Ensure sparkline covers full 31 days
    const desiredDays = 31;
    let displayData = data;
    if (data.length < desiredDays) {
        displayData = Array(desiredDays - data.length).fill(0).concat(data);
    } else if (data.length > desiredDays) {
        displayData = data.slice(-desiredDays);
    }

    // Calculate bar width and spacing
    const barSpacing = 0.8;
    const count = displayData.length;
    const barWidth = (100 - (count - 1) * barSpacing) / count;

    // Data is already oldest (left) to newest (right)
    const plotData = displayData;
    const chartWidth = 100;
    const totalBarWidth = plotData.length * (barWidth + barSpacing) - barSpacing;
    const offsetX = chartWidth - totalBarWidth;

    // Create bars for each day, including zero values
    plotData.forEach((value, index) => {
        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const x = offsetX + index * (barWidth + barSpacing);
        
        // Use logarithmic scale for bar heights
        const minBarHeight = 2;
        const maxBarHeight = 50;
        let height = minBarHeight;
        
        if (value > 0 && maxValue > 0) {
            // Add 1 to avoid log(0) and ensure minimum height for small values
            const logValue = Math.log10(value + 1);
            const logMax = Math.log10(maxValue + 1);
            // Scale to bar height range, ensuring minimum height for non-zero values
            height = minBarHeight + ((logValue / logMax) * (maxBarHeight - minBarHeight));
        }
        
        bar.setAttribute('x', x);
        bar.setAttribute('y', 80 - height);
        bar.setAttribute('width', barWidth);
        bar.setAttribute('height', height);
        
        // Distinct styling for zero vs non-zero bars
        bar.setAttribute('fill', value === 0 ? '#aaa' : '#FFD700');
        bar.setAttribute('stroke', value === 0 ? '#666' : 'none');
        bar.setAttribute('stroke-width', value === 0 ? '1' : '0');
        
        // Add tooltip with exact count
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${value} detections`;
        bar.appendChild(title);
        
        barsGroup.appendChild(bar);
    });

    svg.appendChild(barsGroup);
    return svg;
}

export function renderDetectionCard(detection, maxValue, badgeType) {
    const card = document.createElement('div');
    card.className = 'detection-card';

    const detectionCount = detection.total_detections;
    const lastDetected = new Date(detection.last_detected).toLocaleTimeString();
    const maxDailyDetections = maxValue;

    // Create card HTML
    card.innerHTML = `
        <img src="${detection.image_url || detection.thumbnail_url || 'images/placeholder-bird.jpg'}" 
             alt="${detection.common_name}" 
             onerror="this.src='images/placeholder-bird.jpg'">
        <div class="detection-info">
            <div class="detection-label">${detection.common_name}</div>
            <div class="detection-sparkline"></div>
        </div>
    `;

    // Add badge for new or rare detections
    if (badgeType) {
        const badge = document.createElement('div');
        badge.className = `detection-badge badge-${badgeType}`;
        badge.textContent = badgeType.toUpperCase();
        card.appendChild(badge);
    }

    // Log image dimensions to detect upscaling
    const imgEl = card.querySelector('img');
    imgEl.onload = function() {
        console.log(`Image check for ${detection.common_name}: natural ${this.naturalWidth}x${this.naturalHeight}, displayed ${this.clientWidth}x${this.clientHeight}`);
    };

    // Add histogram with real frequency data
    const sparklineContainer = card.querySelector('.detection-sparkline');
    sparklineContainer.appendChild(createHistogram(detection.frequency, maxDailyDetections));

    return card;
}
