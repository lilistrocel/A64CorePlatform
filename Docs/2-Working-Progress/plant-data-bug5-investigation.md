# Bug #5: Edit Form Validation Investigation

**Date Created:** 2025-11-01
**Priority:** HIGH
**Type:** Bug Investigation
**Component:** Plant Data Library - Edit Modal
**Assigned To:** TBD (Recommend: @agent-frontend-dev-expert or @agent-backend-dev-expert)

---

## Problem Statement

The EditPlantDataModal fails form validation with 17 field errors when attempting to submit, despite all visible fields appearing valid. The onSubmit handler never executes because React Hook Form blocks submission due to invalid form state.

---

## Background Context

This bug was discovered during a bug fix session where 4 other critical bugs were successfully fixed:
- ✅ Bug #1: Validation rejecting 0 values
- ✅ Bug #2: Duplicate forms in DOM
- ✅ Bug #3: Submit button outside form element
- ⚠️ Bug #4: Empty number field validation (partial fix using z.preprocess)

Bug #5 emerged after applying the z.preprocess fix for Bug #4, suggesting the fix may have introduced new issues or revealed existing problems.

---

## Symptoms

### Observable Behavior

1. **Initial State**: Form loads with no visible errors
   ```
   Form state: {isValid: false, isSubmitting: false, errorCount: 0}
   ```

2. **After Submit Click**: 17 validation errors appear
   ```
   Form state: {isValid: false, isSubmitting: true, errorCount: 0}   // During
   Form state: {isValid: false, isSubmitting: false, errorCount: 17}  // After
   ```

3. **No onSubmit Execution**: The submit handler never runs
   - No console log: `[EditPlantDataModal] ✅ onSubmit called with data:`
   - No network requests (no PATCH to `/api/v1/farm/plant-data-enhanced/{id}`)
   - Modal stays open

4. **No Visible Error Messages**: DOM shows no error text or red borders on fields

### Console Evidence

```javascript
[LOG] [EditPlantDataModal] Form state: {isValid: false, isSubmitting: false, errorCount: 0, errorFields: Array(0)}
[LOG] [EditPlantDataModal] Form state: {isValid: false, isSubmitting: true, errorCount: 0, errorFields: Array(0)}
[LOG] [EditPlantDataModal] Form state: {isValid: false, isSubmitting: false, errorCount: 17, errorFields: Array(17)}
```

---

## Technical Details

### Current Validation Schema

The schema uses z.preprocess to handle empty values:

```typescript
const plantDataSchema = z.object({
  // String fields - working fine
  plantName: z.string().min(1, 'Plant name is required').max(100, 'Name too long').optional(),
  scientificName: z.string().optional(),

  // Number fields with preprocess - POTENTIALLY PROBLEMATIC
  germinationDays: z.preprocess(
    (val) => (val === '' || val === null ? undefined : Number(val)),
    z.number().nonnegative('Cannot be negative').optional()
  ),
  expectedWastePercent: z.preprocess(
    (val) => (val === '' || val === null ? undefined : Number(val)),
    z.number().nonnegative('Cannot be negative').max(100, 'Cannot exceed 100%').optional()
  ),

  // ... 20+ more number fields with same pattern
});
```

### Form Data Population

The form is populated via reset() in useEffect:

```typescript
useEffect(() => {
  if (plantData) {
    const defaultValues = {
      plantName: plantData.plantName || '',
      scientificName: plantData.scientificName || '',
      // ... string fields

      germinationDays: plantData.growthCycle?.germinationDays,
      expectedWastePercent: plantData.yield?.expectedWastePercent,
      // ... number fields - MAY BE undefined, null, or empty
    };

    reset(defaultValues);
  }
}, [plantData, reset]);
```

---

## Suspected Root Causes

### 1. z.preprocess Incompatibility with zodResolver

**Hypothesis:** `z.preprocess` may not work correctly with `@hookform/resolvers/zod`'s zodResolver.

**Evidence:**
- Form validates fine initially (errorCount: 0)
- Errors only appear after submit attempt
- 17 errors suggests systematic issue, not user input problem

**Investigation Needed:**
- Check zodResolver documentation for preprocess support
- Test if preprocess functions execute during validation
- Try alternative transformation methods

### 2. Form Value Type Mismatches

**Hypothesis:** Input elements are sending string values, but schema expects numbers even after preprocess.

**Evidence:**
- HTML input type="number" still sends strings in form data
- reset() may be setting values as wrong types

**Investigation Needed:**
- Log actual form values before validation
- Check if values are strings, numbers, undefined, or null
- Verify preprocess transformation is applied

### 3. Missing valueAsNumber Configuration

**Hypothesis:** React Hook Form inputs need `valueAsNumber` prop to send numbers instead of strings.

**Current Implementation:**
```typescript
<Input
  type="number"
  {...register('germinationDays')}  // Missing valueAsNumber!
/>
```

**Should Be:**
```typescript
<Input
  type="number"
  {...register('germinationDays', { valueAsNumber: true })}
/>
```

**Investigation Needed:**
- Review all number input registrations
- Test with valueAsNumber added
- Check if this eliminates need for z.preprocess

### 4. Schema Definition Issues

**Hypothesis:** Optional fields may need both `.optional()` and `.nullable()`.

**Current:**
```typescript
z.number().nonnegative().optional()
```

**May Need:**
```typescript
z.number().nonnegative().nullable().optional()
// or
z.union([z.number().nonnegative(), z.null(), z.undefined()])
```

### 5. Reset Logic Populating Incorrect Values

**Hypothesis:** The reset() call may be setting empty number fields to `""` or `NaN` instead of `undefined`.

**Investigation Needed:**
- Add logging before reset() to show defaultValues
- Check API response data structure
- Verify null/undefined handling in data transformation

---

## Investigation Steps

### Phase 1: Identify Failing Fields

1. **Enhanced Error Logging** (Already Added)
   ```typescript
   if (errorFields.length > 0) {
     console.log('[EditPlantDataModal] ❌ Validation errors:');
     errorFields.forEach(err => {
       console.log(`  - ${err.field}: ${err.message}`);
     });
   }
   ```

2. **Form Value Logging**
   Add before submit:
   ```typescript
   const formValues = watch();
   console.log('[EditPlantDataModal] Current form values:', formValues);
   ```

3. **Test Submission**
   - Open Edit modal
   - Make small change (e.g., edit plant name)
   - Click submit
   - Review console logs to see which 17 fields are failing and why

### Phase 2: Test Hypotheses

**Test #1: Add valueAsNumber**
```typescript
// In one number field
<Input
  type="number"
  {...register('germinationDays', { valueAsNumber: true })}
/>
```
- If this fixes the field, apply to all number inputs

**Test #2: Change Schema to nullable**
```typescript
germinationDays: z.number().nonnegative().nullable().optional()
```
- Test if this allows null/undefined values

**Test #3: Remove preprocess**
```typescript
// Try without preprocess
germinationDays: z.number().nonnegative().optional()
```
- Add valueAsNumber to inputs
- See if simpler approach works

**Test #4: Use transform instead**
```typescript
germinationDays: z.union([
  z.string().transform(val => val === '' ? undefined : Number(val)),
  z.number(),
  z.undefined()
]).pipe(z.number().nonnegative().optional())
```

**Test #5: Custom validation**
```typescript
germinationDays: z.any().refine(
  (val) => val === undefined || val === null || (typeof val === 'number' && val >= 0),
  { message: 'Cannot be negative' }
).optional()
```

### Phase 3: Compare with Add Modal

**Objective:** Determine if Add modal has the same issue

1. **Test Add Form**
   - Open Add modal
   - Fill all required fields
   - Leave optional number fields empty
   - Click submit
   - Check if POST request is sent

2. **Compare Implementations**
   - If Add works but Edit doesn't, compare:
     - Schema definitions (should be identical)
     - Input registration (check for differences)
     - Form initialization (Add has no reset logic)

3. **Identify Differences**
   - Document any implementation differences
   - Test if Edit works without reset()
   - Test if Add breaks when adding reset()

---

## Success Criteria

The investigation is complete when:

1. ✅ All 17 failing fields are identified
2. ✅ Root cause is determined
3. ✅ Fix is implemented and tested
4. ✅ Edit form successfully submits with valid data
5. ✅ PATCH request is sent to API
6. ✅ Modal closes after successful update
7. ✅ Form works with empty optional fields
8. ✅ Form works with 0 values in number fields
9. ✅ No validation errors for valid inputs

---

## Files to Review

### Primary Investigation Files

1. **EditPlantDataModal.tsx:25-70**
   - Validation schema definition
   - z.preprocess usage

2. **EditPlantDataModal.tsx:495-505**
   - useForm hook configuration
   - zodResolver setup

3. **EditPlantDataModal.tsx:519-572**
   - Form reset logic
   - Default values population

4. **EditPlantDataModal.tsx:700-1130**
   - Form field registrations
   - Input elements
   - Check for missing valueAsNumber

### Comparison Files

5. **AddPlantDataModal.tsx:25-70**
   - Compare schema with Edit modal

6. **AddPlantDataModal.tsx:700-1150**
   - Compare input registrations

---

## Related Issues

- [DevLog] `2025-11-01_plant-data-bug-fixes.md` - Bug fix session summary
- [Test Report] `plant-data-library-test-report.md` - Original bug discovery
- [Working Progress] This document

---

## Notes for Investigator

### Things That Work

- ✅ Form loads without errors initially
- ✅ View modal displays all data correctly
- ✅ Form accepts text input changes
- ✅ Conditional rendering (only 1 form in DOM)
- ✅ Submit button inside form element
- ✅ GET requests to fetch plant data work

### Known Issues

- ❌ Form validation fails with 17 errors on submit
- ❌ onSubmit handler never executes
- ❌ No PATCH requests sent
- ❌ Modal doesn't close after submit attempt

### Environment

- **Docker Container:** `a64core-user-portal-dev`
- **Frontend:** Vite + React + TypeScript
- **Form Library:** React Hook Form v7.x
- **Validation:** Zod v3.x with zodResolver
- **Styling:** Styled Components

### Debugging Tools

1. **Browser Console:** Check for validation error logs
2. **React DevTools:** Inspect form state
3. **Network Tab:** Verify no PATCH requests
4. **DOM Inspector:** Check form structure

### Test Data

Use existing "Tomato" plant for testing:
- Plant ID: `550e8400-e29b-41d4-a716-446655440001`
- Current version: v1
- Has all fields populated including optional ones

---

## Priority Justification

**HIGH Priority** because:
1. Edit functionality is completely broken (0% working)
2. Blocks any plant data updates in production
3. Affects farm management module usability
4. Already invested significant debugging time
5. Issue is subtle and requires expert knowledge

**Not CRITICAL** because:
1. Add functionality may still work (needs testing)
2. Workaround exists (delete and recreate plant data)
3. View functionality works fine
4. Data integrity not at risk

---

## Recommended Agent

**@agent-frontend-dev-expert** - This agent specializes in:
- React Hook Form debugging
- Zod validation issues
- Form data transformation
- TypeScript type handling
- Input element configuration

**Alternative:** @agent-backend-dev-expert if the issue requires API-level validation understanding.

---

## Timeline

- **Created:** 2025-11-01
- **Status:** OPEN
- **Target Resolution:** Next session
- **Effort Estimate:** 2-4 hours (complex validation debugging)

---

## Updates

_This section will be updated as investigation progresses._
