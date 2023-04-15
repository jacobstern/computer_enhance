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

const FLAGS = ['s', 'z'];

export function initialMachineState() {
    return {
        registers: Buffer.alloc(REGISTER_WORD_LAYOUT.__size),
        ip: 0,
        flags: { s: false, z: false },
    };
}

/**
 *
 * @param {*} machineState
 * @param {string} name
 * @returns {number} The value of the register
 */
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

export function cloneMachineState(machineState) {
    const registers = Buffer.from(machineState.registers);
    return { registers, flags: { ...machineState.flags }, ip: machineState.ip };
}

function reinterpretUInt16AsInt16(value) {
    const truncated = value & ((1 << 15) - 1);
    if (value & (1 << 15)) {
        return -((1 << 15) - truncated);
    }
    return truncated;
}

function reinterpretInt16AsUInt16(value) {
    let truncated = value & ((1 << 15) - 1);
    if (value < 0) {
        truncated |= 1 << 15;
    }
    return truncated;
}

function printRegisterAsHex(value, { pad, unsigned } = {}) {
    let asUInt16 = value;
    if (!unsigned) {
        asUInt16 = reinterpretInt16AsUInt16(value);
    }
    let hex = asUInt16.toString(16);
    if (pad) {
        hex = '0'.repeat(4 - hex.length) + hex;
    }
    return '0x' + hex;
}

function printFlags(flags) {
    let flagsString = '';
    for (const f of FLAGS) {
        if (flags[f]) {
            flagsString += f.toUpperCase();
        }
    }
    return flagsString;
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
    if (beforeMachineState.ip !== afterMachineState.ip) {
        const beforeAsHex = printRegisterAsHex(beforeMachineState.ip, {
            unsigned: true,
        });
        const afterAsHex = printRegisterAsHex(afterMachineState.ip, {
            unsigned: true,
        });
        updates.push(`ip:${beforeAsHex}->${afterAsHex}`);
    }
    let didFlagsUpdate = false;
    for (const f of FLAGS) {
        if (beforeMachineState.flags[f] !== afterMachineState.flags[f]) {
            didFlagsUpdate = true;
        }
    }
    if (didFlagsUpdate) {
        const beforeFlags = printFlags(beforeMachineState.flags);
        const afterFlags = printFlags(afterMachineState.flags);
        updates.push(`flags:${beforeFlags}->${afterFlags}`);
    }
    return updates.join(' ');
}

export function outputFinalMachineState(machineState) {
    console.log('Final registers:');
    for (const registerName in REGISTER_WORD_LAYOUT) {
        const value = readRegister(machineState, registerName);
        if (value !== 0) {
            const valueAsHex = printRegisterAsHex(value, { pad: true });
            console.log(`      ${registerName}: ${valueAsHex} (${value})`);
        }
    }
    if (machineState.ip !== 0) {
        const valueAsHex = printRegisterAsHex(machineState.ip, {
            pad: true,
            unsigned: true,
        });
        console.log(`      ip: ${valueAsHex} (${machineState.ip})`);
    }
    console.log(`   flags: ${printFlags(machineState.flags)}`);
}

function evaluateEffectiveAddress(machineState, operand) {
    const { base, displacement = 0 } = operand;
    let baseValue = 0;
    switch (base) {
        case 'bx + si':
            baseValue =
                readRegister(machineState, 'bx') +
                readRegister(machineState, 'si');
            break;
        case 'bx + di':
            baseValue =
                readRegister(machineState, 'bx') +
                readRegister(machineState, 'di');
            break;
        case 'bp + si':
            baseValue =
                readRegister(machineState, 'bp') +
                readRegister(machineState, 'si');
            break;
        case 'bp + di':
            baseValue =
                readRegister(machineState, 'bp') +
                readRegister(machineState, 'di');
            break;
        default:
            baseValue = readRegister(machineState, base);
            break;
    }
    return baseValue + displacement;
}

function computeBinaryOpResult(machineState, instruction, memory) {
    const { source, destination, op } = instruction;
    let value = 0;
    switch (source.type) {
        case 'register':
            value = readRegister(machineState, source.registerName);
            break;
        case 'immediate':
            value = source.value;
            break;
        case 'directAddress':
            value = memory.readInt16LE(source.address);
            break;
        case 'effectiveAddress': {
            const address = evaluateEffectiveAddress(machineState, source);
            value = memory.readInt16LE(address);
            break;
        }
        default:
            break;
    }
    if (op === 'cmp' || op === 'add' || op === 'sub') {
        const { registerName } = destination;
        if (op === 'cmp' || op === 'sub') {
            value = -value;
        }
        const valueAsUInt16 = reinterpretInt16AsUInt16(value);
        const destValue = readRegister(machineState, registerName);
        const destValueAsUInt16 = reinterpretInt16AsUInt16(destValue);
        const result = valueAsUInt16 + destValueAsUInt16;
        value = reinterpretUInt16AsInt16(result);
        machineState.flags.z = value === 0;
        machineState.flags.s = value < 0;
    }
    return value;
}

function writeBinaryOp(machineState, destination, value, memory) {
    switch (destination.type) {
        case 'register':
            writeRegister(machineState, destination.registerName, value);
            break;
        case 'directAddress':
            memory.writeInt16LE(value, destination.address);
            break;
        case 'effectiveAddress':
            const address = evaluateEffectiveAddress(machineState, destination);
            memory.writeInt16LE(value, address);
            break;
        default:
            break;
    }
}

export function executeBinaryOp(machineState, instruction, memory) {
    const { op, destination } = instruction;
    const value = computeBinaryOpResult(machineState, instruction, memory);
    if (op !== 'cmp') {
        writeBinaryOp(machineState, destination, value, memory);
    }
}

export function execJump(machineState, instruction) {
    const { op } = instruction;
    if (op === 'jne') {
        if (!machineState.flags.z) {
            machineState.ip += instruction.increment;
        }
    }
}
