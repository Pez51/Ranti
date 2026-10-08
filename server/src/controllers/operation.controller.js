import * as operationService from '../modules/operations/operation.service.js';

export const createOperation = async (req, res, next) => {
  try {
    const result = await operationService.createOperation(req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) { next(error); }
};

export const listParticipantOperations = async (req, res, next) => {
  try {
    const result = await operationService.listParticipantOperations(req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const getParticipantOperation = async (req, res, next) => {
  try {
    const result = await operationService.getParticipantOperation(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const acceptOperation = async (req, res, next) => {
  try {
    const result = await operationService.acceptOperation(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const rejectOperation = async (req, res, next) => {
  try {
    const result = await operationService.rejectOperation(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const cancelOperation = async (req, res, next) => {
  try {
    const result = await operationService.cancelOperation(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};

export const confirmDelivery = async (req, res, next) => {
  try {
    const result = await operationService.confirmDelivery(req.params.id, req.body.otp_code, req.user.id);
    res.status(200).json(result);
  } catch (error) { next(error); }
};