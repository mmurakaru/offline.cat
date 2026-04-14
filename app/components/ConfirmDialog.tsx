import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <DialogTrigger>
      {children}
      <ModalOverlay className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
        <Modal className="max-w-sm w-full mx-4">
          <Dialog className="bg-grey-1 dark:bg-grey-23 border border-grey-3 dark:border-ui-divider rounded-lg shadow-lg p-5 outline-none">
            <Heading
              slot="title"
              className="text-sm font-semibold text-grey-9 dark:text-grey-4"
            >
              {title}
            </Heading>
            <p className="text-sm text-grey-7 dark:text-grey-6 mt-2">
              {description}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                slot="close"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-grey-7 dark:text-grey-6 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer outline-none focus:ring-2 focus:ring-primary-6 transition-colors"
              >
                {t("dialog.cancel")}
              </Button>
              <Button
                onPress={onConfirm}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 cursor-pointer outline-none focus:ring-2 focus:ring-primary-6 transition-colors"
              >
                {confirmLabel}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
