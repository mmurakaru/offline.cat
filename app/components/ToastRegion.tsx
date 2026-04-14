import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { composeTailwindRenderProps } from "../lib/compose-tailwind-render-props";
import "./Toast.css";
import {
  Button,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  type ToastProps,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { flushSync } from "react-dom";

interface MyToastContent {
  title: string;
  description?: string;
}

export const queue = new ToastQueue<MyToastContent>({
  wrapUpdate(fn) {
    if ("startViewTransition" in document) {
      document.startViewTransition(() => {
        flushSync(fn);
      });
    } else {
      fn();
    }
  },
});

function MyToastInner({ toast }: { toast: { content: MyToastContent } }) {
  const { t } = useTranslation();

  return (
    <>
      <ToastContent className="flex flex-col flex-1 min-w-0">
        <Text
          slot="title"
          className="font-medium text-sm text-grey-9 dark:text-grey-4"
        >
          {toast.content.title}
        </Text>
        {toast.content.description && (
          <Text
            slot="description"
            className="text-xs text-grey-7 dark:text-grey-6 mt-0.5"
          >
            {toast.content.description}
          </Text>
        )}
      </ToastContent>
      <Button
        slot="close"
        aria-label={t("toast.close")}
        className="flex flex-none appearance-none w-8 h-8 rounded-sm bg-transparent border-none text-grey-7 dark:text-grey-6 p-0 outline-none hover:bg-black/5 dark:hover:bg-white/10 pressed:bg-black/10 dark:pressed:bg-white/15 items-center justify-center cursor-pointer [-webkit-tap-highlight-color:transparent]"
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </Button>
    </>
  );
}

export function MyToastRegion() {
  return (
    <ToastRegion
      queue={queue}
      className="fixed bottom-4 right-4 flex flex-col-reverse gap-2 rounded-lg outline-none z-50"
    >
      {({ toast }) => (
        <MyToast toast={toast}>
          <MyToastInner toast={toast} />
        </MyToast>
      )}
    </ToastRegion>
  );
}

export function MyToast(props: ToastProps<MyToastContent>) {
  return (
    <Toast
      {...props}
      style={{ viewTransitionName: props.toast.key } as CSSProperties}
      className={composeTailwindRenderProps(
        props.className,
        "react-aria-Toast flex items-center gap-3 bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider px-4 py-3 rounded-lg shadow-lg outline-none w-70",
      )}
    />
  );
}
