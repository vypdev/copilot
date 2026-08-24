export interface UseCase<T> {
    invoke(): Promise<T>;
}
