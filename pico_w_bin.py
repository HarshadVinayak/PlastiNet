import machine
import network
import random
import time

try:
    import ujson as json
except ImportError:
    import json

try:
    import urequests as requests
except ImportError:
    requests = None


# Cloud-dependent smart bin simulator for Pico W / ESP32-S3 style firmware.
# The device owns sensing, QR generation, camera capture, servo movement, and display.
# The cloud owns QR registration, material intelligence, and points decisions.

WIFI_SSID = "YOUR_WIFI_SSID"
WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"
BIN_ID = "001"
API_BASE_URL = "http://192.168.1.10:3000"
REQUEST_TIMEOUT_SECONDS = 5
REQUEST_RETRIES = 3

EPOCH_OFFSET = 946684800

led = machine.Pin("LED", machine.Pin.OUT)
object_sensor = machine.Pin(14, machine.Pin.IN, machine.Pin.PULL_UP)
servo_pwm = machine.PWM(machine.Pin(15))
servo_pwm.freq(50)


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if wlan.isconnected():
        print("Wi-Fi already connected:", wlan.ifconfig()[0])
        return wlan

    print("Connecting to Wi-Fi...")
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)

    timeout = 12
    while not wlan.isconnected() and timeout > 0:
        led.toggle()
        time.sleep(1)
        timeout -= 1

    if not wlan.isconnected():
        led.off()
        raise RuntimeError("Wi-Fi connection failed.")

    led.on()
    print("Connected:", wlan.ifconfig()[0])
    return wlan


def generate_qr_data():
    timestamp = int(time.time() + EPOCH_OFFSET)
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    random_id = "".join(random.choice(chars) for _ in range(5))
    return "BIN_{}_{}_{}".format(BIN_ID, timestamp, random_id)


def sensor_triggered():
    return object_sensor.value() == 0


def capture_minimal_ov7670_data():
    # Placeholder for a minimal OV7670 capture pipeline.
    # A real ESP32-S3 build would grab a tiny grayscale frame and compress it.
    sample_bytes = []
    for _ in range(12):
        sample_bytes.append("{:02x}".format(random.getrandbits(8)))
    return "ov7670:min:{}".format("".join(sample_bytes))


def post_json(path, payload, retries=REQUEST_RETRIES, timeout=REQUEST_TIMEOUT_SECONDS):
    if requests is None:
        raise RuntimeError("urequests is required on the device.")

    url = "{}{}".format(API_BASE_URL, path)

    for attempt in range(1, retries + 1):
        response = None
        try:
            print("POST", url, "attempt", attempt)
            response = requests.post(
                url,
                data=json.dumps(payload),
                headers={"Content-Type": "application/json"},
                timeout=timeout
            )
            status = response.status_code
            body = response.json()
            if 200 <= status < 300:
                return body
            print("API error", status, body)
        except Exception as error:
            print("Request failed:", error)
        finally:
            if response is not None:
                response.close()

        if attempt < retries:
            time.sleep(attempt)

    return {"success": False, "message": "Cloud request failed after retries."}


def register_qr(qr_id):
    return post_json("/registerQR", {"qrId": qr_id})


def submit_scan(qr_id, image_data):
    payload = {
        "qrId": qr_id,
        "sensor": True,
        "imageData": image_data
    }
    return post_json("/scan", payload)


def servo_angle_to_duty(angle):
    min_duty = 1638
    max_duty = 8192
    return int(min_duty + (max_duty - min_duty) * (angle / 180))


def move_servo_for_type(material_type):
    type_to_angle = {
        "PET": 20,
        "HDPE": 70,
        "ALUMINUM": 120,
        "MIXED": 160
    }
    angle = type_to_angle.get(material_type, 90)
    servo_pwm.duty_u16(servo_angle_to_duty(angle))
    time.sleep(1)
    servo_pwm.duty_u16(servo_angle_to_duty(90))
    return angle


def display_result(success, message):
    print("[DISPLAY]", message)
    if success:
        for _ in range(2):
            led.off()
            time.sleep(0.15)
            led.on()
            time.sleep(0.15)
    else:
        for _ in range(3):
            led.toggle()
            time.sleep(0.2)


def process_object():
    qr_id = generate_qr_data()
    print("Generated QR:", qr_id)

    register_response = register_qr(qr_id)
    if not register_response.get("success"):
        display_result(False, register_response.get("message", "QR registration failed"))
        return

    image_data = capture_minimal_ov7670_data()
    scan_response = submit_scan(qr_id, image_data)

    if not scan_response.get("success"):
        display_result(False, scan_response.get("message", "Scan rejected"))
        return

    material_type = scan_response.get("type", "MIXED")
    points = scan_response.get("points", 0)
    move_servo_for_type(material_type)
    display_result(True, "{} | +{} pts".format(material_type, points))


def main():
    connect_wifi()
    print("Cloud smart bin ready. Waiting for object trigger...")

    while True:
        try:
            if sensor_triggered():
                process_object()
                time.sleep(1.5)
            time.sleep(0.1)
        except Exception as error:
            print("Runtime error:", error)
            display_result(False, "System error")
            time.sleep(2)


if __name__ == "__main__":
    main()
