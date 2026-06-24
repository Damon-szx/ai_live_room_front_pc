import { DyCast } from "@/core/dycast";

export function createDouyinCast(roomNo: string) {
  return new DyCast(roomNo);
}

export { DyCast };
