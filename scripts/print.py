#!/usr/bin/env python3
import sys
import usb.core
import usb.util

def kirim_ke_printer(data):
    dev = usb.core.find(idVendor=0x0fe6, idProduct=0x811e)
    if dev is None:
        print('ERROR: Printer tidak ditemukan', file=sys.stderr)
        sys.exit(1)
    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
    except Exception:
        pass  # already configured
    cfg = dev.get_active_configuration()
    intf = cfg[(0, 0)]
    ep = usb.util.find_descriptor(
        intf,
        custom_match=lambda e:
            usb.util.endpoint_direction(e.bEndpointAddress)
            == usb.util.ENDPOINT_OUT
    )
    if ep is None:
        print('ERROR: Endpoint tidak ditemukan', file=sys.stderr)
        sys.exit(1)
    ep.write(data)
    print('OK')

if __name__ == '__main__':
    data = sys.stdin.buffer.read()
    kirim_ke_printer(data)
