#!/usr/bin/env python3
import sys
import usb.core
import usb.util

VENDOR_ID  = 0x0fe6
PRODUCT_ID = 0x811e

def main():
    data = sys.stdin.buffer.read()
    if not data:
        print("ERROR: no data received", flush=True)
        sys.exit(1)

    dev = usb.core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)
    if dev is None:
        print("ERROR: printer not found (0x0fe6:0x811e)", flush=True)
        sys.exit(1)

    if dev.is_kernel_driver_active(0):
        try:
            dev.detach_kernel_driver(0)
        except usb.core.USBError as e:
            print(f"ERROR: cannot detach kernel driver: {e}", flush=True)
            sys.exit(1)

    try:
        dev.set_configuration()
    except usb.core.USBError:
        pass  # already configured

    cfg = dev.get_active_configuration()
    intf = cfg[(0, 0)]

    ep = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
    )

    if ep is None:
        print("ERROR: no OUT endpoint found", flush=True)
        sys.exit(1)

    chunk_size = 64
    for i in range(0, len(data), chunk_size):
        ep.write(data[i:i + chunk_size])

    print("OK: printed successfully", flush=True)

if __name__ == '__main__':
    main()
