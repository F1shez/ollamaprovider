// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from "child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import * as vscode from "vscode";

const tempDir =
  process.env.TEMP ||
  process.env.TMP ||
  "C:\\Users\\veret\\AppData\\Local\\Temp\\";

const lockFilePath = path.join(tempDir, "ollamaprovider.lock");

function registerInstance() {
  try {
    // Проверяем существует ли файл
    if (!existsSync(lockFilePath)) {
      // Если нет, создаем его и записываем PID текущего процесса
      writeFileSync(lockFilePath, `${process.pid}\n`);
    } else {
      // Если файл существует, добавляем PID текущего процесса
      appendFileSync(lockFilePath, `${process.pid}\n`);
    }
  } catch (err) {
    console.error("Ошибка при регистрации экземпляра:", err);
  }
}

async function checkRunningOllama() {
  return new Promise((res, rej) => {
    exec('tasklist | findstr /i "ollama.exe"', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error.message}`);
        // rej(error);
        res(false);
        return;
      }
      if (stderr) {
        console.error(`Command execution resulted in error: ${stderr}`);
        res(false);
        // rej(stderr);
        return;
      }

      // stdout contains the output of the command
      if (stdout.trim() === "") {
        console.log("ollama.exe is not running.");
        res(false);
      } else {
        console.log("ollama.exe is running:");
        console.log(stdout);
        res(true);
      }
    });
  });
}

async function unregisterInstance() {
  return new Promise((res, rej) => {
    try {
      // Читаем lock файл
      const instances = readFileSync(lockFilePath, "utf-8")
        .split("\n")
        .filter(Boolean);
      const updatedInstances = instances.filter(
        (pid) => pid !== String(process.pid)
      );

      if (updatedInstances.length === 0) {
        // Если после удаления текущего экземпляра в файле ничего не осталось, это последний экземпляр
        console.log("Это был последний экземпляр Node.js.");
        exec("taskkill /F /IM ollama.exe");
        exec("taskkill /F /IM ollama_llama_server.exe");
        vscode.window.showInformationMessage("Ollama app stopped!");
        unlinkSync(lockFilePath); // Удаляем lock файл
        res(true);
      } else {
        if (updatedInstances.length === 1) {
          updatedInstances.push("");
        }
        // Обновляем lock файл, удаляя текущий PID
        writeFileSync(lockFilePath, updatedInstances.join("\n"));
        res(true);
      }
    } catch (err) {
      console.error("Ошибка при удалении экземпляра:", err);
      rej(err);
    }
  });
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Ollama extension activated!");
  try {
    registerInstance();
    checkRunningOllama().then((isRunning) => {
      if (!isRunning) {
        exec("ollama serve");
        vscode.window.showInformationMessage(
          "Ollama app started successfully!"
        );
      }
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start Ollama app: ${error}`);
  }
}

// This method is called when your extension is deactivated
export async function deactivate() {
  try {
    await unregisterInstance();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to stop Ollama app: ${(error as any).message}`
    );
  }
}
