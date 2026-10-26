// ConfirmAdapter - prompts user for confirmation before destructive action

import readline from "node:readline";

export class ConfirmAdapter {
  async confirm(message) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(`${message} `, (answer) => {
        rl.close();
        resolve(/^yes$/i.test(answer.trim()));
      });
    });
  }
}