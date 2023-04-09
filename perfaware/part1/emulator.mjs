const REGISTER_WORD_LAYOUT = {
    ax: 0x00,
    bx: 0x02,
    cx: 0x04,
    dx: 0x06,
    sp: 0x08,
    bp: 0x0a,
    si: 0x0c,
    di: 0x0e,
};
Object.defineProperty(REGISTER_WORD_LAYOUT, '__size', {
    value: 0x10,
    enumerable: false,
});

export function initialMachineState() {
    return {
        registers: Buffer.alloc(REGISTER_WORD_LAYOUT.__size),
    };
}

function readRegister(machineState, name) {
    if (REGISTER_WORD_LAYOUT.propertyIsEnumerable(name)) {
        const offset = REGISTER_WORD_LAYOUT[name];
        return machineState.registers.readInt16LE(offset);
    }
    return 0;
}

function writeRegister(machineState, name, value) {
    if (REGISTER_WORD_LAYOUT.propertyIsEnumerable(name)) {
        const offset = REGISTER_WORD_LAYOUT[name];
        machineState.registers.writeInt16LE(value, offset);
    }
}

function cloneMachineState(machineState) {
    const registers = Buffer.from(machineState.registers);
    return { registers };
}

function reinterpretInt16AsUInt16(value) {
    let truncated = value & ((1 << 15) - 1);
    if (value < 0) {
        truncated &= 1 << 15;
    }
    return truncated;
}

function printRegisterAsHex(value, { pad } = {}) {
    const asUInt16 = reinterpretInt16AsUInt16(value);
    let hex = asUInt16.toString(16);
    if (pad) {
        hex = '0'.repeat(4 - hex.length) + hex;
    }
    return '0x' + hex;
}

export function printMachineUpdates(beforeMachineState, afterMachineState) {
    const updates = [];
    for (const registerName in REGISTER_WORD_LAYOUT) {
        const before = readRegister(beforeMachineState, registerName);
        const after = readRegister(afterMachineState, registerName);
        if (before !== after) {
            const beforeAsHex = printRegisterAsHex(before);
            const afterAsHex = printRegisterAsHex(after);
            updates.push(`${registerName}:${beforeAsHex}->${afterAsHex}`);
        }
    }
    return updates.join(', ');
}

export function outputFinalMachineState(machineState) {
    console.log('Final registers:');
    for (const registerName in REGISTER_WORD_LAYOUT) {
        const value = readRegister(machineState, registerName);
        const valueAsHex = printRegisterAsHex(value, { pad: true });
        console.log(`      ${registerName}: ${valueAsHex} (${value})`);
    }
}

export function executeBinaryOp(instruction, machineState) {
    const { op, destination, source } = instruction;
    const updatedMachineState = cloneMachineState(machineState);
    switch (op) {
        case 'mov':
            let value = 0;
            switch (source.type) {
                case 'register':
                    value = readRegister(machineState, source.registerName);
                    break;
                case 'immediate':
                    value = source.value;
                    break;
                default:
                    break;
            }
            if (destination.type === 'register') {
                const { registerName } = destination;
                writeRegister(updatedMachineState, registerName, value);
            }
        default:
            return updatedMachineState;
    }
}
