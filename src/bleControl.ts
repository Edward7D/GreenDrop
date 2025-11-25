// src/bleControl.ts
let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

export function setWriteCharacteristic(ch: BluetoothRemoteGATTCharacteristic) {
  writeChar = ch;
}

export async function bleSendCommand(cmd: string) {
  if (!writeChar) {
    console.warn("No hay characteristic BLE configurada");
    return;
  }
  const enc = new TextEncoder();
  await writeChar.writeValue(enc.encode(cmd));
}
