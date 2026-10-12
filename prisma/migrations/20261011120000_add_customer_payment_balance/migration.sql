-- Saldo del cliente después del abono, guardado al registrarlo: el
-- comprobante y el correo muestran lo que quedó debiendo en ese momento.
-- La tabla todavía no tiene abonos (llegan con este componente).
ALTER TABLE "customer_payments" ADD COLUMN "balanceAfter" DECIMAL(12,2) NOT NULL;

ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_balance_after" CHECK ("balanceAfter" >= 0);
