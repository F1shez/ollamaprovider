import { exec } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import * as vscode from "vscode";

const tempDir = process.env.TEMP || process.env.TMP || "C:\\Windows\\Temp\\";
const lockFilePath = path.join(tempDir, "ollamaprovider.lock");

// Проверяет, существует ли процесс с указанным PID
function checkPidExists(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`tasklist /FI "PID eq ${pid}"`, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      const exists = stdout.includes(`${pid.toString()}`);
      resolve(exists);
    });
  });
}

// Удаляет неактивные PID из lock-файла и останавливает ollama при необходимости
async function cleanupStalePids() {
  if (!existsSync(lockFilePath)) return;

  try {
    const pids = readFileSync(lockFilePath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((pid) => parseInt(pid, 10));

    const activePids = [];
    for (const pid of pids) {
      if (await checkPidExists(pid)) {
        activePids.push(pid);
      } else {
        console.log(`Удаление неактивного PID: ${pid}`);
      }
    }

    if (activePids.length === 0) {
      console.log("Все процессы завершены, остановка Ollama.");
      exec("taskkill /F /IM ollama.exe");
      exec("taskkill /F /IM ollama_llama_server.exe");
      unlinkSync(lockFilePath);
    } else {
      writeFileSync(lockFilePath, activePids.join("\n") + "\n");
    }
  } catch (err) {
    console.error("Ошибка при очистке PID:", err);
  }
}

// Регистрирует текущий экземпляр VS Code
function registerInstance() {
  try {
    cleanupStalePids().then(() => {
      const currentPid = process.pid;
      let pids: number[] = [];

      if (existsSync(lockFilePath)) {
        pids = readFileSync(lockFilePath, "utf-8")
          .split("\n")
          .filter(Boolean)
          .map((pid) => parseInt(pid, 10));
      }

      if (!pids.includes(currentPid)) {
        pids.push(currentPid);
        writeFileSync(lockFilePath, pids.join("\n") + "\n");
      }
    });
  } catch (err) {
    console.error("Ошибка регистрации:", err);
  }
}

// Проверяет, запущен ли процесс ollama
async function checkRunningOllama(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('tasklist | findstr /i "ollama.exe"', (error, stdout) => {
      resolve(stdout.trim() !== "");
    });
  });
}

// Удаляет текущий PID из lock-файла
async function unregisterInstance() {
  try {
    if (!existsSync(lockFilePath)) return;

    const pids = readFileSync(lockFilePath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((pid) => parseInt(pid, 10));

    const updatedPids = pids.filter((pid) => pid !== process.pid);

    if (updatedPids.length === 0) {
      unlinkSync(lockFilePath);
      exec("taskkill /F /IM ollama.exe");
      exec("taskkill /F /IM ollama_llama_server.exe");
    } else {
      writeFileSync(lockFilePath, updatedPids.join("\n") + "\n");
    }
  } catch (err) {
    console.error("Ошибка при удалении PID:", err);
  }
}

// Активация расширения
export async function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Ollama extension activated!");

  // Запуск периодической очистки каждые 30 секунд
  const interval = setInterval(cleanupStalePids, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  await cleanupStalePids();
  registerInstance();

  if (!(await checkRunningOllama())) {
    exec("start /B ollama serve", (err) => {
      if (err) {
        vscode.window.showErrorMessage("Ошибка запуска Ollama: " + err.message);
      } else {
        vscode.window.showInformationMessage("Ollama успешно запущен!");
      }
    });
  }
}

// Деактивация расширения
export async function deactivate() {
  await unregisterInstance();
  await cleanupStalePids();
}
