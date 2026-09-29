import { EventModel } from '../models/event.model';
import { Event } from '../types/event.types';
import { formatDbDate, getCurrentDateTime } from '../config/database';

// Transform database event to frontend format
const transformEvent = (dbEvent: any): any => {
  // Compute status based on deleted_at and event_date
  let status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled' = 'scheduled';
  
  if (dbEvent.deleted_at) {
    // If event is soft-deleted (cancelled), status is cancelled
    status = 'cancelled';
  } else if (dbEvent.event_date) {
    // Compare calendar days on the app's UTC-6 clock, not the host's timezone
    const eventDay = dbEvent.event_date instanceof Date ? formatDbDate(dbEvent.event_date) : String(dbEvent.event_date).slice(0, 10);
    const today = getCurrentDateTime().slice(0, 10);
    status = eventDay < today ? 'completed' : 'scheduled';
  }

  return {
    event_id: dbEvent.event_id,
    event_name: dbEvent.name,
    description: dbEvent.description,
    event_date: dbEvent.event_date,
    start_time: dbEvent.start_time,
    end_time: dbEvent.end_time,
    location: dbEvent.location,
    max_capacity: dbEvent.max_participants,
    ticket_price: dbEvent.ticket_price != null ? Number(dbEvent.ticket_price) : null,
    image_url: dbEvent.image_url || null,
    status: status,
    created_by: dbEvent.coordinator_id,
    coordinator_id: dbEvent.coordinator_id,
    coordinator_name: dbEvent.coordinator_name,
    current_registrations: Number(dbEvent.current_registrations ?? 0),
    deleted_at: dbEvent.deleted_at || null,  // Include deleted_at for soft delete detection
  };
};

// Transform frontend event to database format
const transformToDb = (frontendEvent: any): any => {
  const dbEvent: any = {
    name: frontendEvent.event_name || frontendEvent.name,
    description: frontendEvent.description,
    event_date: frontendEvent.event_date,
    start_time: frontendEvent.start_time,
    end_time: frontendEvent.end_time,
    location: frontendEvent.location,
    image_url: frontendEvent.image_url || null,
    max_participants: frontendEvent.max_capacity || frontendEvent.max_participants,
    ticket_price: frontendEvent.ticket_price !== undefined ? frontendEvent.ticket_price : null,
    // coordinator_id is what the form edits; created_by is the older name for the same column
    coordinator_id: frontendEvent.coordinator_id ?? frontendEvent.created_by,
  };

  // Remove undefined fields
  Object.keys(dbEvent).forEach(key => dbEvent[key] === undefined && delete dbEvent[key]);
  return dbEvent;
};

export const getAllActiveEvents = async (): Promise<any[]> => {
  const events = await EventModel.findAll();
  return events.map(transformEvent);
};

export const getAllEventsIncludingDeleted = async (): Promise<any[]> => {
  const events = await EventModel.findAllIncludingDeleted();
  return events.map(transformEvent);
};

export const createEvent = async (eventData: any): Promise<any> => {
  const dbEvent = transformToDb(eventData);
  const created = await EventModel.create(dbEvent);
  return transformEvent(created);
};

export const getEventById = async (eventId: number): Promise<any | null> => {
  const event = await EventModel.findById(eventId);
  return event ? transformEvent(event) : null;
};

export const updateEvent = async (eventId: number, eventData: any): Promise<any | null> => {
  const dbEvent = transformToDb(eventData);
  const updated = await EventModel.update(eventId, dbEvent);
  return updated ? transformEvent(updated) : null;
};

export const deleteEvent = async (eventId: number): Promise<boolean> => {
  return await EventModel.remove(eventId);
};