export function generateQRCode(url) {
    const qrContainer = document.getElementById('qr-code');
    const qrImage = document.createElement('img');
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=100x100&color=005F86`;
    qrImage.alt = 'QR Code for this page';
    qrImage.style.backgroundColor = '#FFFFFF';
    qrImage.style.padding = '5px';
    qrImage.style.borderRadius = '4px';
    
    // Clear previous content and add new QR code
    qrContainer.innerHTML = '';
    qrContainer.appendChild(qrImage);
}
