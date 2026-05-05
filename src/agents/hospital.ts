import type { AgentProfile } from '../types/agent.js';
import { requireEnv } from '../env.js';

const SYSTEM_PROMPT = `Eres el asistente de agendamiento de la Clínica San Ignacio (red privada en Bogotá y Medellín).

Tu rol: ayudar a pacientes a consultar médicos, ver horarios disponibles, agendar citas, cancelar citas y consultar sus citas existentes.

Reglas:
- Responde siempre en español neutro, cálido y profesional.
- Usa las herramientas disponibles antes de inventar información. Si no sabes el doctor_id exacto, primero lista médicos con list_doctors.
- Antes de agendar (book_appointment), verifica disponibilidad con get_doctor_schedule.
- Si el paciente no te ha dado su patient_ref o nombre completo para agendar, pídelos.
- Las fechas se manejan en formato ISO 8601 (2026-03-15T09:00:00). El horario de atención es lunes a viernes de 9:00 a 11:30 y de 14:00 a 16:30.
- Al cancelar una cita pide confirmación antes de llamar la herramienta.
- Si una herramienta devuelve error, explícale al paciente lo ocurrido en sus términos, sin filtrar errores técnicos.

Herramientas disponibles:
- list_doctors(area?, place?) — catálogo de médicos.
- get_doctor_schedule(doctor_id, days_ahead?) — slots libres de 30 min.
- book_appointment(doctor_id, patient_ref, patient_name, slot_start, specialty?) — crea cita.
- cancel_appointment(appointment_id, reason?) — cancela una cita existente.
- get_patient_appointments(patient_ref, status?) — consulta citas del paciente.
- send_confirmation_email(tenant_id, to, subject, html_body, idempotency_key, category?) — envía un correo de confirmación al paciente.

Política de correos:
- Cada vez que **book_appointment** devuelva éxito, llama inmediatamente a **send_confirmation_email** con el correo del paciente para confirmarle la cita por escrito.
  · subject: "Confirmación de cita — Clínica San Ignacio"
  · html_body: párrafo amable + lista con doctor, especialidad, lugar, fecha/hora, ID de cita
  · idempotency_key: el appointment_id devuelto por book_appointment
  · category: "appointment.confirmation"
  · tenant_id: "demo-tenant"
- Si el paciente no ha proporcionado un correo electrónico válido, **pídeselo** antes de llamar a book_appointment.
- to es siempre un arreglo (lista) de uno o más correos.
`;

export const hospitalProfile: AgentProfile = {
  id: 'hospital-mock',
  name: 'Hospital Mock Agent',
  description: 'Scheduling assistant for Clínica San Ignacio mock environment',
  locale: 'es-CO',
  systemPrompt: SYSTEM_PROMPT,
  modelConfig: {
    baseUrl: requireEnv('OPENAI_BASE_URL'),
    model: requireEnv('OPENAI_DEFAULT_MODEL'),
    temperature: 0.3,
    maxTokens: 1024,
  },
  tools: [
    {
      name: 'list_doctors',
      description: 'List available doctors, optionally filtered by specialty area or location.',
      parameters: {
        type: 'object',
        properties: {
          area: {
            type: 'string',
            description: 'Specialty keyword to filter by (e.g. "cardio", "pediatria")',
          },
          place: {
            type: 'string',
            description: 'Location keyword to filter by (e.g. "Bogota", "Medellin")',
          },
        },
      },
    },
    {
      name: 'get_doctor_schedule',
      description: 'Get available 30-minute appointment slots for a specific doctor.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: {
            type: 'string',
            description: 'Doctor identifier (e.g. "doc-001")',
          },
          days_ahead: {
            type: 'number',
            description: 'How many days ahead to look (default 7, max 30)',
          },
        },
        required: ['doctor_id'],
      },
    },
    {
      name: 'book_appointment',
      description: 'Book a confirmed appointment for a patient with a specific doctor at a given slot.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: {
            type: 'string',
            description: 'Doctor identifier',
          },
          patient_ref: {
            type: 'string',
            description: 'Patient identifier (e.g. "HOSP-PAT-00492")',
          },
          patient_name: {
            type: 'string',
            description: 'Full patient name',
          },
          slot_start: {
            type: 'string',
            description: 'Appointment start time in ISO 8601 format (e.g. "2026-03-15T09:00:00")',
          },
          specialty: {
            type: 'string',
            description: "Doctor's specialty (defaults to doctor's own specialty)",
          },
        },
        required: ['doctor_id', 'patient_ref', 'patient_name', 'slot_start'],
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment (marks as cancelled, does not delete it).',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: {
            type: 'string',
            description: 'Appointment identifier to cancel',
          },
          reason: {
            type: 'string',
            description: 'Cancellation reason (optional)',
          },
        },
        required: ['appointment_id'],
      },
    },
    {
      name: 'get_patient_appointments',
      description: 'List all appointments for a patient, optionally filtered by status.',
      parameters: {
        type: 'object',
        properties: {
          patient_ref: {
            type: 'string',
            description: 'Patient identifier',
          },
          status: {
            type: 'string',
            description: 'Filter by status: "confirmed", "cancelled", or "all" (default)',
            enum: ['confirmed', 'cancelled', 'all'],
          },
        },
        required: ['patient_ref'],
      },
    },
    {
      name: 'send_confirmation_email',
      description:
        'Send a confirmation email to the patient via the email-send service. Call this immediately after a successful book_appointment so the patient gets written confirmation.',
      parameters: {
        type: 'object',
        properties: {
          tenant_id: {
            type: 'string',
            description: 'Tenant identifier (use "demo-tenant" in this environment).',
          },
          to: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of recipient email addresses (always pass as an array even if there is only one).',
          },
          subject: {
            type: 'string',
            description: 'Email subject line.',
          },
          html_body: {
            type: 'string',
            description: 'HTML body of the email.',
          },
          idempotency_key: {
            type: 'string',
            description: 'Idempotency key — use the appointment_id returned by book_appointment to avoid duplicates.',
          },
          category: {
            type: 'string',
            description: 'Category tag for the audit log, e.g. "appointment.confirmation".',
          },
        },
        required: ['tenant_id', 'to', 'subject', 'html_body', 'idempotency_key'],
      },
    },
  ],
  escalation: {
    enabled: false,
    operatorTtlSeconds: 120,
    ttlFallback: 'bot_resume',
  },
  allowedSpecialties: [
    'Cardiología',
    'Pediatría',
    'Medicina General',
    'Neurología',
    'Ortopedia',
  ],
  allowedLocations: ['Bogotá', 'Medellín'],
};
