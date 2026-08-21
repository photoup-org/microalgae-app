"use client";

import { Loader2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red confirm button for destructive actions (the default - this component exists mainly for deletes). */
    destructive?: boolean;
    pending?: boolean;
    onConfirm: () => void;
}

/**
 * App-wide confirm gate for destructive actions - replaces window.confirm(), which
 * blocks the whole tab (including automated testing) and can't be themed or styled.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    destructive = true,
    pending = false,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                        }}
                        disabled={pending}
                        className={destructive ? "bg-danger text-white hover:bg-danger/90" : undefined}
                    >
                        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
