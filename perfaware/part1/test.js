#!/usr/bin/env node

const { execFileSync, execSync } = require('node:child_process');
const { writeFileSync, unlinkSync } = require('node:fs');
const { format } = require('node:util');

function main() {
    const inFile = process.argv[2];
    let result;
    try {
        result = execFileSync('./sim8086.mjs', [inFile], { encoding: 'utf-8' });
    } catch (e) {
        process.exit(1);
    }
    const testAsmFile = format('%s-disassembled.asm', inFile);
    writeFileSync(testAsmFile, result);
    execSync(format('nasm %s', testAsmFile));
    const testOutFile = testAsmFile.replace(/\.asm$/, '');
    let success = true;
    try {
        execSync(format('diff %s %s', inFile, testOutFile), {
            encoding: 'utf-8',
        });
    } catch (e) {
        success = false;
        console.error('FAIL');
        console.error(e.stdout.trim());
    }
    if (success) {
        console.log('PASS');
    }
    unlinkSync(testAsmFile);
    unlinkSync(testOutFile);
    if (!success) {
        process.exitCode = 1;
    }
}

main();
