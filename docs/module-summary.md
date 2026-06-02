# Module Summary

| Module | Tables | Key Rules |
|--------|--------|-----------|
| Patient CRM | Patient, Visit, Treatment, Invoice, LabJob | IC=Malaysian / Passport=Foreigner for SST; lab fees never on patient invoice |
| Doctor Commission | DoctorCommission, DoctorProfile, LocumEngagement | (Tx-Lab)×Split×Rate; Locum floor=MAX(comm,sessions×rate) |
| Staff Commission | StaffCommission, Attendance, CommissionConfig, CommissionTier | Treatments only; forfeit if EL+MC+Unpaid+Late>threshold; pro-rate by attendance |
| Scheduling | Schedule | Doctor-Nurse pairing; one slot per doctor per time per clinic |
| Stock & DO | StockItem, ClinicStock, DeliveryOrder, DOLine | HQ dispatches; clinic confirms; month-end inter-entity invoice |
| Pool Orders | PoolOrder, PoolParticipant | Any clinic initiates; if billed to initiator, initiator invoices others |
| Finance Ledger | DailyLedger | 15 columns per clinic; panel columns = one per provider; Atome reconciled separately |
| Multi-entity | Entity, Clinic, PanelProvider | SST on foreigners; e-invoice per entity; panel per clinic |
| RBAC | User, UserClinic | 7 roles; clinic-scoped access enforced at middleware level |
