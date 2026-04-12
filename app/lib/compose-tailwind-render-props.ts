import { composeRenderProps } from "react-aria-components";
import { twMerge } from "tailwind-merge";

export function composeTailwindRenderProps<T>(
  className: string | ((renderProps: T) => string) | undefined,
  tw: string,
): string | ((renderProps: T) => string) {
  return composeRenderProps(className, (className) => twMerge(tw, className));
}
