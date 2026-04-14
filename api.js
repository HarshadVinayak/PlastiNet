// The frontend and API are served from the same Express app in local and deployed environments.
const API_BASE_URL = window.location.origin;

export const registerQrWithServer = async (qrData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/registerQR`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                qrId: qrData.raw || qrData.qrId || qrData
            }),
        });

        return await response.json();
    } catch (error) {
        console.error('QR registration error:', error);
        return { success: false, message: 'Connection to server failed while registering QR.' };
    }
};

export const sendScanToServer = async (qrData, userData = {}) => {
    try {
        const response = await fetch(`${API_BASE_URL}/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                qrId: qrData.raw,
                userId: userData.userId || userData.email
            }),
        });

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, message: 'Connection to server failed.' };
    }
};

export const askCloeWithGroq = async ({ question, customEntries = [], userName = '' }) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/cloe/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question,
                customEntries,
                userName,
            }),
        });

        return await response.json();
    } catch (error) {
        console.error('Cloe chat API error:', error);
        return { success: false, message: 'Connection to Cloe failed.' };
    }
};
