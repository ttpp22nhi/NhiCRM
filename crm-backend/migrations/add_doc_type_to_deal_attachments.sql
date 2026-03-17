-- Add doc_type to deal_attachments for better UX categorization
-- Examples: quotation, contract, survey, invoice, other

ALTER TABLE public.deal_attachments
  ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) NULL;

COMMENT ON COLUMN public.deal_attachments.doc_type IS 'Loại tài liệu (phục vụ UI/UX): quotation, contract, survey, invoice, other...';

CREATE INDEX IF NOT EXISTS idx_deal_attachments_doc_type ON public.deal_attachments (doc_type);

