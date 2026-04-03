// The frontend and API are served from the same Express app in local and deployed environments.
const API_BASE_URL = window.location.origin;

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
