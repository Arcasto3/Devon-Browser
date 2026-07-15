export interface WorkerTask {
  id: string
  type: "parse" | "transform" | "validate"
  data: any
}

export interface WorkerResult {
  id: string
  success: boolean
  data?: any
  error?: string
}

export class WorkerPool {
  private static workers: Worker[] = []
  private static maxWorkers = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4
  private static taskQueue: Array<{
    task: WorkerTask
    resolve: (result: WorkerResult) => void
    reject: (error: Error) => void
  }> = []
  private static activeWorkers = 0
  private static initialized = false

  static async init(): Promise<void> {
    // Initialize worker pool
    if (this.initialized || typeof window === "undefined" || typeof Worker === "undefined") {
      return
    }

    // Initialize worker pool with error handling
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const workerBlob = new Blob(
          [
            `
          self.onmessage = async (event) => {
            const { id, type, data } = event.data;
            try {
              let result;
              switch (type) {
                case "parse":
                  result = { parsed: true, content: data.content };
                  break;
                case "transform":
                  result = data.content;
                  break;
                case "validate":
                  result = { valid: true, errors: [] };
                  break;
                default:
                  throw new Error('Unknown task type: ' + type);
              }
              self.postMessage({ id, success: true, data: result });
            } catch (error) {
              self.postMessage({ 
                id, 
                success: false, 
                error: error.message || 'Unknown error' 
              });
            }
          };
        `,
          ],
          { type: "application/javascript" },
        )

        const workerUrl = URL.createObjectURL(workerBlob)
        const worker = new Worker(workerUrl)
        this.workers.push(worker)
      } catch (error) {
        console.warn("[v0] Failed to create worker:", error)
        break
      }
    }

    this.initialized = true
    console.log(`[v0] Worker pool initialized with ${this.workers.length} workers`)
  }

  static async execute(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      if (this.workers.length === 0) {
        reject(new Error("No workers available"))
        return
      }

      this.taskQueue.push({ task, resolve, reject })
      this.processQueue()
    })
  }

  private static processQueue(): void {
    if (this.taskQueue.length === 0 || this.activeWorkers >= this.workers.length) {
      return
    }

    const { task, resolve, reject } = this.taskQueue.shift()!
    const worker = this.workers[this.activeWorkers % this.workers.length]
    this.activeWorkers++

    const timeout = setTimeout(() => {
      reject(new Error("Worker task timeout"))
      this.activeWorkers--
      this.processQueue()
    }, 30000) // 30 second timeout

    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      clearTimeout(timeout)
      this.activeWorkers--
      resolve(event.data)
      this.processQueue()
    }

    worker.onerror = (error) => {
      clearTimeout(timeout)
      this.activeWorkers--
      reject(new Error(error.message))
      this.processQueue()
    }

    worker.postMessage(task)
  }

  static terminate(): void {
    this.workers.forEach((worker) => worker.terminate())
    this.workers = []
    this.taskQueue = []
    this.activeWorkers = 0
    this.initialized = false
  }

  static getStats() {
    return {
      totalWorkers: this.workers.length,
      activeWorkers: this.activeWorkers,
      queuedTasks: this.taskQueue.length,
    }
  }
}
