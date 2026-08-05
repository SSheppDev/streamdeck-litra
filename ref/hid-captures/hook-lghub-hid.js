// Hook G HUB HID writes (IOKit + libc write)
'use strict';

function hex(buf, len) {
  if (!buf) return '';
  const n = Math.min(len || 64, 64);
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(('0' + buf.add(i).readU8().toString(16)).slice(-2));
  }
  return arr.join(' ');
}

function looksLikeHidpp(ptr, len) {
  if (len < 4) return false;
  try {
    const b0 = ptr.readU8();
    // HID++ long 0x11 or short 0x10, or report id 0x00 then 0x11
    return b0 === 0x11 || b0 === 0x10 || (b0 === 0x00 && len > 1 && ptr.add(1).readU8() === 0x11);
  } catch (_) {
    return false;
  }
}

function logWrite(tag, buf, len) {
  if (!buf || len <= 0) return;
  // Only log HID++-ish or Litra-sized packets (7/20/21)
  if (!(looksLikeHidpp(buf, len) || len === 7 || len === 20 || len === 21 || len === 64)) return;
  const h = hex(buf, Math.min(len, 32));
  console.log(JSON.stringify({ t: Date.now(), tag, len, hex: h }));
}

function tryHook(name, addr, hooks) {
  if (!addr || addr.isNull()) {
    console.log(JSON.stringify({ t: Date.now(), tag: 'no_symbol', name }));
    return;
  }
  try {
    Interceptor.attach(addr, hooks);
    console.log(JSON.stringify({ t: Date.now(), tag: 'hooked', name: name, addr: addr.toString() }));
  } catch (e) {
    console.log(JSON.stringify({ t: Date.now(), tag: 'hook_fail', name, err: e.message }));
  }
}

const IOKit = Module.findExportByName('IOKit', 'IOHIDDeviceSetReport');
tryHook('IOHIDDeviceSetReport', IOKit, {
  onEnter(args) {
    // IOReturn IOHIDDeviceSetReport(IOHIDDeviceRef, IOHIDReportType, CFIndex reportID, const uint8_t *report, CFIndex len)
    this.report = args[3];
    this.len = args[4].toInt32();
    this.rtype = args[1].toInt32();
    this.rid = args[2].toInt32();
  },
  onLeave(retval) {
    logWrite('IOHIDDeviceSetReport rtype=' + this.rtype + ' rid=' + this.rid, this.report, this.len);
  }
});

const setReportWithCallback = Module.findExportByName('IOKit', 'IOHIDDeviceSetReportWithCallback');
tryHook('IOHIDDeviceSetReportWithCallback', setReportWithCallback, {
  onEnter(args) {
    this.report = args[3];
    this.len = args[4].toInt32();
  },
  onLeave() {
    logWrite('IOHIDDeviceSetReportWithCallback', this.report, this.len);
  }
});

// libc write / writev fallback
const writePtr = Module.findExportByName(null, 'write');
tryHook('write', writePtr, {
  onEnter(args) {
    this.fd = args[0].toInt32();
    this.buf = args[1];
    this.len = args[2].toInt32();
  },
  onLeave() {
    if (this.len >= 4 && this.len <= 64) logWrite('write fd=' + this.fd, this.buf, this.len);
  }
});

console.log(JSON.stringify({ t: Date.now(), tag: 'ready', pid: Process.id }));
