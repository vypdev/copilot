export interface ParamUseCase<P, T> {
    taskId: string;
    invoke(param: P): Promise<T>;
}
