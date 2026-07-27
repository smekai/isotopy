export type Listener<T> = (value: T) => void;

export class ListenerRegistry<T> {
  private readonly buckets = new Map<string, Set<Listener<T>>>();

  add(key: string, listener: Listener<T>): () => void {
    const bucket = this.buckets.get(key) ?? new Set<Listener<T>>();
    bucket.add(listener);
    this.buckets.set(key, bucket);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.buckets.delete(key);
      }
    };
  }

  has(key: string): boolean {
    return this.buckets.has(key);
  }

  emit(key: string, value: T): void {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(value);
    }
  }
}
